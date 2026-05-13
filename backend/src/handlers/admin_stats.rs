// Admin-only advertiser stats endpoints.
//
// Three endpoint families:
//   * /overview, /segments, /trends, /snapshot — platform-wide rollups.
//     Super_admin only; brand_admin gets 403.
//   * /brand/:brand_id — brand-scoped aggregate + budget summary.
//     Super sees any brand; brand_admin only their own (require_brand_scope).
//
// All output is sourced from anonymous aggregate tables
// (`daily_metrics`, `segment_metrics`, `event_counters`,
// `ad_metrics`, `affiliate_clicks`) which are k-anonymity-guarded
// at write time. These endpoints never read user-tied tables.

use axum::extract::{Path, Query, State};
use axum::routing::get;
use axum::{Json, Router};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::admin_context::AdminContext;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/overview", get(overview))
        .route("/segments", get(segments))
        .route("/trends", get(trends))
        .route("/snapshot", get(snapshot))
        .route("/brand/{brand_id}", get(brand_summary))
}

// ── /overview (super only) ─────────────────────────────────────

#[derive(Deserialize)]
pub struct OverviewQuery {
    pub days: Option<i32>,
}

#[derive(Serialize)]
struct DailyRow {
    date: NaiveDate,
    total_users: i32,
    new_users: i32,
    dau: i32,
    mau: i32,
    total_dates_logged: i32,
    new_dates_logged: i32,
}

async fn overview(
    State(state): State<AppState>,
    ctx: AdminContext,
    Query(q): Query<OverviewQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let days = q.days.unwrap_or(90).clamp(1, 365);

    let rows = sqlx::query_as::<_, (NaiveDate, i32, i32, i32, i32, i32, i32)>(
        r#"
        SELECT date, total_users, new_users, dau, mau, total_dates_logged, new_dates_logged
        FROM daily_metrics
        WHERE date >= (CURRENT_DATE - ($1::int))
        ORDER BY date ASC
        "#,
    )
    .bind(days)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|r| DailyRow {
        date: r.0,
        total_users: r.1,
        new_users: r.2,
        dau: r.3,
        mau: r.4,
        total_dates_logged: r.5,
        new_dates_logged: r.6,
    })
    .collect::<Vec<_>>();

    let latest = rows.last();
    let headline = latest.map(|r| {
        let ratio = if r.mau > 0 {
            (r.dau as f64) / (r.mau as f64)
        } else {
            0.0
        };
        json!({
            "as_of": r.date,
            "total_users": r.total_users,
            "dau": r.dau,
            "mau": r.mau,
            "dau_mau_ratio": ratio,
            "total_dates_logged": r.total_dates_logged,
        })
    });

    Ok(Json(json!({
        "success": true,
        "data": {
            "headline": headline,
            "series": rows,
        },
        "error": null
    })))
}

// ── /segments (super only) ─────────────────────────────────────

#[derive(Deserialize)]
pub struct SegmentsQuery {
    pub date: Option<NaiveDate>,
    pub segment_key: Option<String>,
}

#[derive(Serialize)]
struct SegmentRow {
    segment_key: String,
    segment_value: String,
    cohort_size: i32,
}

async fn segments(
    State(state): State<AppState>,
    ctx: AdminContext,
    Query(q): Query<SegmentsQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let resolved_date: Option<NaiveDate> = match q.date {
        Some(d) => Some(d),
        None => sqlx::query_scalar("SELECT MAX(date) FROM segment_metrics")
            .fetch_one(&state.db)
            .await?,
    };

    let Some(date) = resolved_date else {
        return Ok(Json(json!({
            "success": true,
            "data": { "date": null, "rows": [] },
            "error": null
        })));
    };

    let rows = if let Some(ref key) = q.segment_key {
        sqlx::query_as::<_, (String, String, i32)>(
            r#"
            SELECT segment_key, segment_value, cohort_size
            FROM segment_metrics
            WHERE date = $1 AND segment_key = $2
            ORDER BY cohort_size DESC
            "#,
        )
        .bind(date)
        .bind(key)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, (String, String, i32)>(
            r#"
            SELECT segment_key, segment_value, cohort_size
            FROM segment_metrics
            WHERE date = $1
            ORDER BY segment_key, cohort_size DESC
            "#,
        )
        .bind(date)
        .fetch_all(&state.db)
        .await?
    };

    let out: Vec<SegmentRow> = rows
        .into_iter()
        .map(|(k, v, c)| SegmentRow { segment_key: k, segment_value: v, cohort_size: c })
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": { "date": date, "rows": out },
        "error": null
    })))
}

// ── /trends (super only) ───────────────────────────────────────

#[derive(Deserialize)]
pub struct TrendsQuery {
    pub segment_key: String,
    pub segment_value: Option<String>,
    pub days: Option<i32>,
}

#[derive(Serialize)]
struct TrendRow {
    date: NaiveDate,
    segment_value: String,
    cohort_size: i32,
}

async fn trends(
    State(state): State<AppState>,
    ctx: AdminContext,
    Query(q): Query<TrendsQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let days = q.days.unwrap_or(180).clamp(1, 365);

    let rows = if let Some(ref val) = q.segment_value {
        sqlx::query_as::<_, (NaiveDate, String, i32)>(
            r#"
            SELECT date, segment_value, cohort_size
            FROM segment_metrics
            WHERE segment_key = $1
              AND segment_value = $2
              AND date >= (CURRENT_DATE - ($3::int))
            ORDER BY date ASC
            "#,
        )
        .bind(&q.segment_key)
        .bind(val)
        .bind(days)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, (NaiveDate, String, i32)>(
            r#"
            SELECT date, segment_value, cohort_size
            FROM segment_metrics
            WHERE segment_key = $1
              AND date >= (CURRENT_DATE - ($2::int))
            ORDER BY date ASC, segment_value ASC
            "#,
        )
        .bind(&q.segment_key)
        .bind(days)
        .fetch_all(&state.db)
        .await?
    };

    let out: Vec<TrendRow> = rows
        .into_iter()
        .map(|(d, v, c)| TrendRow { date: d, segment_value: v, cohort_size: c })
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": { "segment_key": q.segment_key, "rows": out },
        "error": null
    })))
}

// ── /snapshot (super only) ─────────────────────────────────────

#[derive(Deserialize)]
pub struct SnapshotQuery {
    pub days: Option<i32>,
    pub segments: Option<String>,
}

async fn snapshot(
    State(state): State<AppState>,
    ctx: AdminContext,
    Query(q): Query<SnapshotQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let days = q.days.unwrap_or(90).clamp(1, 365);

    let series = sqlx::query_as::<_, (NaiveDate, i32, i32, i32, i32, i32, i32)>(
        r#"
        SELECT date, total_users, new_users, dau, mau, total_dates_logged, new_dates_logged
        FROM daily_metrics
        WHERE date >= (CURRENT_DATE - ($1::int))
        ORDER BY date ASC
        "#,
    )
    .bind(days)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|r| DailyRow {
        date: r.0,
        total_users: r.1,
        new_users: r.2,
        dau: r.3,
        mau: r.4,
        total_dates_logged: r.5,
        new_dates_logged: r.6,
    })
    .collect::<Vec<_>>();

    let latest_date: Option<NaiveDate> =
        sqlx::query_scalar("SELECT MAX(date) FROM segment_metrics")
            .fetch_one(&state.db)
            .await?;

    let segments: Vec<SegmentRow> = if let Some(date) = latest_date {
        let filter = q
            .segments
            .as_deref()
            .map(|s| s.split(',').map(str::trim).map(str::to_string).collect::<Vec<_>>());
        let rows = if let Some(ref keys) = filter {
            sqlx::query_as::<_, (String, String, i32)>(
                r#"
                SELECT segment_key, segment_value, cohort_size
                FROM segment_metrics
                WHERE date = $1 AND segment_key = ANY($2)
                ORDER BY segment_key, cohort_size DESC
                "#,
            )
            .bind(date)
            .bind(keys)
            .fetch_all(&state.db)
            .await?
        } else {
            sqlx::query_as::<_, (String, String, i32)>(
                r#"
                SELECT segment_key, segment_value, cohort_size
                FROM segment_metrics
                WHERE date = $1
                ORDER BY segment_key, cohort_size DESC
                "#,
            )
            .bind(date)
            .fetch_all(&state.db)
            .await?
        };
        rows.into_iter()
            .map(|(k, v, c)| SegmentRow { segment_key: k, segment_value: v, cohort_size: c })
            .collect()
    } else {
        Vec::new()
    };

    Ok(Json(json!({
        "success": true,
        "data": {
            "as_of": latest_date,
            "series": series,
            "segments": segments,
            "k_threshold": crate::services::k_anonymity::K_THRESHOLD,
        },
        "error": null
    })))
}

// ════════════════════════════════════════════════════════════════
// /brand/:brand_id — brand-scoped aggregate + budget summary
// ════════════════════════════════════════════════════════════════
//
// What's safe to expose here:
//   * Aggregate impressions / clicks / CTR across the brand's campaigns
//   * Per-campaign spent_cents / total_budget_cents / progress
//   * Affiliate click totals per brand-owned slug
//   * Auto-pause count (paused_reason='budget_exhausted')
//
// What's NOT exposed (anonymity contract — plan §7):
//   * user_id, user hashes, individual rows from `users` / `dates` etc.
//   * Cross-brand metrics
//   * Per-segment cohorts below k_threshold (handled at write time on
//     segment_metrics — we don't surface that table here at all)

#[derive(Deserialize)]
struct BrandSummaryQuery {
    days: Option<i32>,
}

async fn brand_summary(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(brand_id): Path<Uuid>,
    Query(q): Query<BrandSummaryQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_brand_scope(brand_id)?;

    let days = q.days.unwrap_or(30).clamp(1, 365);

    // Aggregate impressions / clicks over the brand's campaigns
    let totals: (i64, i64) = sqlx::query_as(
        r#"
        SELECT
            COALESCE(SUM(m.impressions), 0)::bigint,
            COALESCE(SUM(m.clicks), 0)::bigint
        FROM ad_metrics m
        JOIN ad_campaigns c ON c.id = m.campaign_id
        WHERE c.brand_id = $1
          AND c.deleted_at IS NULL
          AND m.date >= CURRENT_DATE - ($2::int - 1)
        "#,
    )
    .bind(brand_id)
    .bind(days)
    .fetch_one(&state.db)
    .await?;

    let ctr = if totals.0 > 0 {
        totals.1 as f64 / totals.0 as f64
    } else {
        0.0
    };

    // Budget rollup: sum of spent_cents / total_budget_cents over the
    // brand's non-deleted campaigns that have a numeric budget.
    let budget: (Option<i64>, Option<i64>, Option<i64>) = sqlx::query_as(
        r#"
        SELECT
            COALESCE(SUM(spent_cents), 0)::bigint,
            COALESCE(SUM(total_budget_cents), 0)::bigint,
            COUNT(*) FILTER (WHERE paused_reason = 'budget_exhausted')::bigint
        FROM ad_campaigns
        WHERE brand_id = $1
          AND deleted_at IS NULL
          AND total_budget_cents IS NOT NULL
        "#,
    )
    .bind(brand_id)
    .fetch_one(&state.db)
    .await?;

    let total_spent = budget.0.unwrap_or(0);
    let total_budget = budget.1.unwrap_or(0);
    let overall_progress = if total_budget > 0 {
        Some((total_spent as f64 / total_budget as f64) * 100.0)
    } else {
        None
    };

    // Per-campaign rows
    let per_campaign = sqlx::query_as::<_, (
        Uuid,
        String,
        String,
        Option<i64>,
        i64,
        String,
        Option<String>,
    )>(
        r#"
        SELECT id, brand_name, placement_key, total_budget_cents, spent_cents,
               status, paused_reason
        FROM ad_campaigns
        WHERE brand_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC
        "#,
    )
    .bind(brand_id)
    .fetch_all(&state.db)
    .await?;

    let per_campaign_json: Vec<serde_json::Value> = per_campaign
        .into_iter()
        .map(|r| {
            let progress = match r.3 {
                Some(b) if b > 0 => Some((r.4 as f64 / b as f64) * 100.0),
                _ => None,
            };
            json!({
                "id": r.0,
                "name": r.1,
                "placement_key": r.2,
                "total_budget_cents": r.3,
                "spent_cents": r.4,
                "progress_percent": progress,
                "status": r.5,
                "paused_reason": r.6,
            })
        })
        .collect();

    // Affiliate click rollup
    let affiliate_total: i64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(ac.count), 0)::bigint
        FROM affiliate_clicks ac
        JOIN affiliate_links al ON al.slug = ac.slug
        WHERE al.brand_id = $1
          AND al.deleted_at IS NULL
          AND ac.date >= CURRENT_DATE - ($2::int - 1)
        "#,
    )
    .bind(brand_id)
    .bind(days)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    Ok(Json(json!({
        "success": true,
        "data": {
            "brand_id": brand_id,
            "window_days": days,
            "totals": {
                "impressions": totals.0,
                "clicks": totals.1,
                "ctr": ctr,
            },
            "budget": {
                "total_spent_cents": total_spent,
                "total_budget_cents": total_budget,
                "overall_progress_percent": overall_progress,
                "campaigns_paused_due_to_budget": budget.2.unwrap_or(0),
            },
            "per_campaign": per_campaign_json,
            "affiliate_clicks_total": affiliate_total,
        },
        "error": null
    })))
}
