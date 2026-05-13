// Daily aggregate analytics computation.
//
// Reads from `users`, `dates`, `partners`, `date_tags` and writes
// only aggregate rows into `daily_metrics` and `segment_metrics`.
//
// Anonymity guarantees enforced here:
//   * Every segment row is gated by `k_anonymity::safe_count`.
//     Below-threshold cohorts are silently skipped (never written).
//   * No row in either table contains a user identifier.
//
// Idempotent: re-running for the same `as_of` date is a no-op
// thanks to ON CONFLICT DO UPDATE on the primary key.

use chrono::NaiveDate;
use sqlx::PgPool;

use crate::services::k_anonymity::safe_count;

/// Run the full daily aggregate pipeline for the given date.
/// Errors from individual segments are logged but do not abort
/// the rest of the pipeline.
pub async fn run_daily(db: &PgPool, as_of: NaiveDate) -> Result<(), sqlx::Error> {
    tracing::info!("Analytics aggregator starting for {as_of}");

    compute_daily_metrics(db, as_of).await?;

    // Segment computations are independent. Failures are logged so
    // a broken segment query does not block the rest.
    if let Err(e) = compute_single_proxy(db, as_of).await {
        tracing::error!("segment single_proxy failed: {e}");
    }
    if let Err(e) = compute_active_dater(db, as_of).await {
        tracing::error!("segment active_dater_30d failed: {e}");
    }
    if let Err(e) = compute_high_frequency(db, as_of).await {
        tracing::error!("segment high_frequency_30d failed: {e}");
    }
    if let Err(e) = compute_partner_gender_majority(db, as_of).await {
        tracing::error!("segment partner_gender_majority failed: {e}");
    }
    if let Err(e) = compute_partner_age_distribution(db, as_of).await {
        tracing::error!("segment partner_age_range failed: {e}");
    }
    if let Err(e) = compute_top_cities(db, as_of).await {
        tracing::error!("segment top_city_dates failed: {e}");
    }
    if let Err(e) = compute_tag_category_affinity(db, as_of).await {
        tracing::error!("segment tag_category failed: {e}");
    }

    tracing::info!("Analytics aggregator finished for {as_of}");
    Ok(())
}

// ── daily_metrics ─────────────────────────────────────────────

async fn compute_daily_metrics(db: &PgPool, as_of: NaiveDate) -> Result<(), sqlx::Error> {
    // Window boundaries: [start_of_day, end_of_day) and 30-day rolling MAU.
    let total_users: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE is_active = TRUE",
    )
    .fetch_one(db)
    .await?;

    let new_users: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM users
        WHERE is_active = TRUE
          AND created_at::date = $1
        "#,
    )
    .bind(as_of)
    .fetch_one(db)
    .await?;

    let dau: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM users
        WHERE is_active = TRUE
          AND last_seen_at::date = $1
        "#,
    )
    .bind(as_of)
    .fetch_one(db)
    .await?;

    let mau: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM users
        WHERE is_active = TRUE
          AND last_seen_at >= ($1::date - INTERVAL '29 days')
          AND last_seen_at <  ($1::date + INTERVAL '1 day')
        "#,
    )
    .bind(as_of)
    .fetch_one(db)
    .await?;

    let total_dates: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM dates d
        JOIN users u ON u.id = d.user_id
        WHERE d.deleted_at IS NULL
          AND u.is_active = TRUE
        "#,
    )
    .fetch_one(db)
    .await?;

    let new_dates: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM dates d
        JOIN users u ON u.id = d.user_id
        WHERE d.deleted_at IS NULL
          AND u.is_active = TRUE
          AND d.created_at::date = $1
        "#,
    )
    .bind(as_of)
    .fetch_one(db)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO daily_metrics (
            date, total_users, new_users, dau, mau, total_dates_logged, new_dates_logged
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (date) DO UPDATE SET
            total_users = EXCLUDED.total_users,
            new_users = EXCLUDED.new_users,
            dau = EXCLUDED.dau,
            mau = EXCLUDED.mau,
            total_dates_logged = EXCLUDED.total_dates_logged,
            new_dates_logged = EXCLUDED.new_dates_logged,
            computed_at = NOW()
        "#,
    )
    .bind(as_of)
    .bind(total_users as i32)
    .bind(new_users as i32)
    .bind(dau as i32)
    .bind(mau as i32)
    .bind(total_dates as i32)
    .bind(new_dates as i32)
    .execute(db)
    .await?;

    Ok(())
}

// ── segment helpers ───────────────────────────────────────────

/// Upsert a single segment row IFF it satisfies k-anonymity.
/// Below-threshold cohorts are silently skipped — by design.
async fn upsert_segment(
    db: &PgPool,
    as_of: NaiveDate,
    segment_key: &str,
    segment_value: &str,
    count: i64,
) -> Result<(), sqlx::Error> {
    let Some(safe) = safe_count(count) else {
        // Suppressed by k-anonymity policy. This is normal for small
        // segments; do not log per-row to avoid leaking via log lines.
        return Ok(());
    };

    sqlx::query(
        r#"
        INSERT INTO segment_metrics (date, segment_key, segment_value, cohort_size)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (date, segment_key, segment_value) DO UPDATE SET
            cohort_size = EXCLUDED.cohort_size,
            computed_at = NOW()
        "#,
    )
    .bind(as_of)
    .bind(segment_key)
    .bind(segment_value)
    .bind(safe as i32)
    .execute(db)
    .await?;

    Ok(())
}

// ── single_proxy: users without an active partner ─────────────

async fn compute_single_proxy(db: &PgPool, as_of: NaiveDate) -> Result<(), sqlx::Error> {
    // "Single proxy" = active user with no `partners` row whose
    // relationship_end IS NULL (i.e. nobody currently flagged as ongoing).
    let count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM users u
        WHERE u.is_active = TRUE
          AND NOT EXISTS (
              SELECT 1 FROM partners p
              WHERE p.user_id = u.id AND p.relationship_end IS NULL
          )
        "#,
    )
    .fetch_one(db)
    .await?;

    upsert_segment(db, as_of, "single_proxy", "true", count).await
}

// ── active_dater_30d: 3+ logged dates in last 30 days ─────────

async fn compute_active_dater(db: &PgPool, as_of: NaiveDate) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM (
            SELECT d.user_id
            FROM dates d
            JOIN users u ON u.id = d.user_id
            WHERE d.deleted_at IS NULL
              AND u.is_active = TRUE
              AND d.date_at >= ($1::date - INTERVAL '30 days')
              AND d.date_at <  ($1::date + INTERVAL '1 day')
            GROUP BY d.user_id
            HAVING COUNT(*) >= 3
        ) x
        "#,
    )
    .bind(as_of)
    .fetch_one(db)
    .await?;

    upsert_segment(db, as_of, "active_dater_30d", "true", count).await
}

// ── high_frequency_30d: 5+ logged dates in last 30 days ───────

async fn compute_high_frequency(db: &PgPool, as_of: NaiveDate) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM (
            SELECT d.user_id
            FROM dates d
            JOIN users u ON u.id = d.user_id
            WHERE d.deleted_at IS NULL
              AND u.is_active = TRUE
              AND d.date_at >= ($1::date - INTERVAL '30 days')
              AND d.date_at <  ($1::date + INTERVAL '1 day')
            GROUP BY d.user_id
            HAVING COUNT(*) >= 5
        ) x
        "#,
    )
    .bind(as_of)
    .fetch_one(db)
    .await?;

    upsert_segment(db, as_of, "high_frequency_30d", "true", count).await
}

// ── partner_gender_majority: each user's dominant partner gender ─

async fn compute_partner_gender_majority(
    db: &PgPool,
    as_of: NaiveDate,
) -> Result<(), sqlx::Error> {
    // For each user with ≥3 dates: count partner genders, pick the
    // dominant one (>=70%). Aggregate over users.
    let rows: Vec<(String, i64)> = sqlx::query_as(
        r#"
        WITH per_user AS (
            SELECT
                d.user_id,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE d.gender = 'female') AS f,
                COUNT(*) FILTER (WHERE d.gender = 'male')   AS m,
                COUNT(*) FILTER (WHERE d.gender = 'other')  AS o
            FROM dates d
            JOIN users u ON u.id = d.user_id
            WHERE d.deleted_at IS NULL
              AND u.is_active = TRUE
            GROUP BY d.user_id
            HAVING COUNT(*) >= 3
        ),
        labeled AS (
            SELECT CASE
                WHEN f::float / total >= 0.7 THEN 'female_majority'
                WHEN m::float / total >= 0.7 THEN 'male_majority'
                WHEN o::float / total >= 0.7 THEN 'other_majority'
                ELSE 'mixed'
            END AS bucket
            FROM per_user
        )
        SELECT bucket, COUNT(*)::bigint FROM labeled GROUP BY bucket
        "#,
    )
    .bind(as_of)
    .fetch_all(db)
    .await?;

    for (bucket, count) in rows {
        upsert_segment(db, as_of, "partner_gender_majority", &bucket, count).await?;
    }
    Ok(())
}

// ── partner_age_range_distribution ────────────────────────────

async fn compute_partner_age_distribution(
    db: &PgPool,
    as_of: NaiveDate,
) -> Result<(), sqlx::Error> {
    // Distribution of partner age_range across all (non-deleted) dates
    // logged by active users.
    let rows: Vec<(String, i64)> = sqlx::query_as(
        r#"
        SELECT d.age_range, COUNT(*)::bigint
        FROM dates d
        JOIN users u ON u.id = d.user_id
        WHERE d.deleted_at IS NULL
          AND u.is_active = TRUE
        GROUP BY d.age_range
        "#,
    )
    .fetch_all(db)
    .await?;

    for (age_range, count) in rows {
        upsert_segment(db, as_of, "partner_age_range", &age_range, count).await?;
    }
    Ok(())
}

// ── top_cities: top 50 cities by total date count ─────────────

async fn compute_top_cities(db: &PgPool, as_of: NaiveDate) -> Result<(), sqlx::Error> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
        r#"
        SELECT (c.name || ',' || c.country_code) AS slug, COUNT(*)::bigint
        FROM dates d
        JOIN users u  ON u.id = d.user_id
        JOIN cities c ON c.id = d.city_id
        WHERE d.deleted_at IS NULL
          AND u.is_active = TRUE
        GROUP BY c.id, c.name, c.country_code
        ORDER BY COUNT(*) DESC
        LIMIT 50
        "#,
    )
    .fetch_all(db)
    .await?;

    for (slug, count) in rows {
        upsert_segment(db, as_of, "top_city_dates", &slug, count).await?;
    }
    Ok(())
}

// ── tag_category_affinity ─────────────────────────────────────

async fn compute_tag_category_affinity(
    db: &PgPool,
    as_of: NaiveDate,
) -> Result<(), sqlx::Error> {
    // Count of (date, tag) pairs grouped by tag.category. Useful for
    // venue/activity advertisers ("X% of dates include 'bar' tag").
    let rows: Vec<(String, i64)> = sqlx::query_as(
        r#"
        SELECT t.category, COUNT(*)::bigint
        FROM date_tags dt
        JOIN tags  t ON t.id = dt.tag_id
        JOIN dates d ON d.id = dt.date_id
        JOIN users u ON u.id = d.user_id
        WHERE d.deleted_at IS NULL
          AND u.is_active = TRUE
        GROUP BY t.category
        "#,
    )
    .fetch_all(db)
    .await?;

    for (category, count) in rows {
        upsert_segment(db, as_of, "tag_category", &category, count).await?;
    }
    Ok(())
}
