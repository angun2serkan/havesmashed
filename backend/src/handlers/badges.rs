use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_all_badges))
        .route("/me", get(get_my_badges))
        .route("/friend/{friend_id}", get(get_friend_badges))
        .route("/{id}/sponsor-click", post(track_sponsor_click))
        // Public — auth gerektirmez. Paylaşım linki açıldığında çağrılır.
        .route("/public/{id}", get(get_public_badge))
        // Auth'lu — user kendi earned badge'ini paylaştığında basit
        // event tracking yapar. user_id YOK; yalnız günlük sayaç.
        .route("/{id}/share", post(track_share))
}

/// GET /api/badges/public/:id
/// Auth bypass — paylaşım linki açıldığında görüntülenir. Badge'in
/// status='active' ve (varsa) kampanya tarih penceresi içinde olduğunu
/// kontrol eder; aksi halde 404.
async fn get_public_badge(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<Json<serde_json::Value>, AppError> {
    use sqlx::Row;
    let row = sqlx::query(
        r#"
        SELECT b.id, b.name, b.description, b.icon, b.category, b.threshold,
               b.gender, b.tier, b.image_url,
               b.is_sponsored, b.sponsor_name, b.sponsor_click_url,
               b.brand_id, br.display_name AS brand_display_name
        FROM badges b
        LEFT JOIN brands br ON br.id = b.brand_id
        WHERE b.id = $1
          AND b.status = 'active'
          AND (
            b.campaign_id IS NULL
            OR EXISTS (
              SELECT 1 FROM ad_campaigns c
              WHERE c.id = b.campaign_id
                AND c.deleted_at IS NULL
                AND NOW() BETWEEN c.starts_at AND c.ends_at
            )
          )
        "#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    let Some(r) = row else {
        return Err(AppError::NotFound(
            "Badge not found or not currently visible".to_string(),
        ));
    };

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": r.get::<i32, _>("id"),
            "name": r.get::<String, _>("name"),
            "description": r.get::<String, _>("description"),
            "icon": r.get::<String, _>("icon"),
            "category": r.get::<String, _>("category"),
            "threshold": r.get::<i32, _>("threshold"),
            "gender": r.get::<String, _>("gender"),
            "tier": r.get::<String, _>("tier"),
            "image_url": r.get::<Option<String>, _>("image_url"),
            "is_sponsored": r.get::<bool, _>("is_sponsored"),
            "sponsor_name": r.get::<Option<String>, _>("sponsor_name"),
            "sponsor_click_url": r.get::<Option<String>, _>("sponsor_click_url"),
            "brand_display_name": r.get::<Option<String>, _>("brand_display_name"),
        },
        "error": null
    })))
}

/// POST /api/badges/:id/share
/// Kullanıcı kendi earned badge'ini paylaştığında çağrılır. Önce user
/// gerçekten o badge'i kazanmış mı kontrol, sonra badge_shares'te
/// günlük sayaç artırılır. user_id KAYDEDİLMEZ (anonimite).
async fn track_share(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
) -> Result<Json<serde_json::Value>, AppError> {
    let earned: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_id = $2)",
    )
    .bind(auth.user_id)
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    if !earned {
        return Err(AppError::Forbidden(
            "Yalnızca kazandığın bir badge'i paylaşabilirsin".to_string(),
        ));
    }

    sqlx::query(
        r#"
        INSERT INTO badge_shares (badge_id, date, count)
        VALUES ($1, CURRENT_DATE, 1)
        ON CONFLICT (badge_id, date) DO UPDATE SET count = badge_shares.count + 1
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": { "tracked": true },
        "error": null
    })))
}

/// POST /api/badges/:id/sponsor-click
/// Bumps the badge's `sponsor_click_count` by 1 when the user taps the
/// "Presented by X" strip. Auth is required so anonymous farms can't
/// inflate counters; user identity itself is not stored.
///
/// Brand-owned badges (campaign_id NOT NULL) ayrıca `ad_metrics` ve
/// `ad_placement_metrics` tablolarına click yazar — brand admin dashboard
/// ve budget aggregator buradan okur.
async fn track_sponsor_click(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
) -> Result<Json<serde_json::Value>, AppError> {
    let _ = auth;

    let result = sqlx::query(
        "UPDATE badges SET sponsor_click_count = sponsor_click_count + 1 \
         WHERE id = $1 AND is_sponsored = TRUE"
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Sponsored badge not found".to_string()));
    }

    // Brand campaign metric bump. Sadece serving olan kampanyalar için
    // sayar (status='active', deleted_at IS NULL, is_dry_run=false).
    let campaign: Option<(Uuid, String, String, bool, Option<chrono::DateTime<chrono::Utc>>)> =
        sqlx::query_as(
            r#"
            SELECT c.id, c.placement_key, c.status, c.is_dry_run, c.deleted_at
            FROM badges b
            JOIN ad_campaigns c ON c.id = b.campaign_id
            WHERE b.id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&state.db)
        .await?;

    if let Some((campaign_id, placement_key, status, is_dry_run, deleted_at)) = campaign {
        let is_serving = status == "active" && deleted_at.is_none() && !is_dry_run;
        if is_serving {
            sqlx::query(
                r#"
                INSERT INTO ad_metrics (campaign_id, date, impressions, clicks, extra)
                VALUES ($1, CURRENT_DATE, 0, 1, '{}'::jsonb)
                ON CONFLICT (campaign_id, date) DO UPDATE
                    SET clicks = ad_metrics.clicks + 1
                "#,
            )
            .bind(campaign_id)
            .execute(&state.db)
            .await?;

            sqlx::query(
                r#"
                INSERT INTO ad_placement_metrics (placement_key, date, impressions, clicks, extra)
                VALUES ($1, CURRENT_DATE, 0, 1, '{}'::jsonb)
                ON CONFLICT (placement_key, date) DO UPDATE
                    SET clicks = ad_placement_metrics.clicks + 1
                "#,
            )
            .bind(&placement_key)
            .execute(&state.db)
            .await?;
        }
    }

    Ok(Json(json!({ "success": true, "data": { "tracked": true }, "error": null })))
}

/// GET /api/badges — list all badges with their definitions.
///
/// Yalnız status='active' badge'leri döner. Brand badge'leri (campaign_id
/// NOT NULL) sadece kampanya tarih penceresinde gözükür — ends_at geçtikten
/// sonra "archived" sayılır ve unlock'lanamaz.
async fn get_all_badges(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    use sqlx::Row;
    let rows = sqlx::query(
        r#"
        SELECT b.id, b.name, b.description, b.icon, b.category, b.threshold, b.gender, b.tier,
               b.is_sponsored, b.sponsor_name, b.sponsor_click_url, b.sponsor_logo_url
        FROM badges b
        WHERE b.status = 'active'
          AND (
            b.campaign_id IS NULL
            OR EXISTS (
              SELECT 1 FROM ad_campaigns c
              WHERE c.id = b.campaign_id
                AND c.deleted_at IS NULL
                AND NOW() BETWEEN c.starts_at AND c.ends_at
            )
          )
        ORDER BY b.id
        "#
    )
    .fetch_all(&state.db)
    .await?;

    let result: Vec<serde_json::Value> = rows.iter().map(|r| {
        json!({
            "id": r.get::<i32, _>("id"),
            "name": r.get::<String, _>("name"),
            "description": r.get::<String, _>("description"),
            "icon": r.get::<String, _>("icon"),
            "category": r.get::<String, _>("category"),
            "threshold": r.get::<i32, _>("threshold"),
            "gender": r.get::<String, _>("gender"),
            "tier": r.get::<String, _>("tier"),
            "is_sponsored": r.get::<bool, _>("is_sponsored"),
            "sponsor_name": r.get::<Option<String>, _>("sponsor_name"),
            "sponsor_click_url": r.get::<Option<String>, _>("sponsor_click_url"),
            "sponsor_logo_url": r.get::<Option<String>, _>("sponsor_logo_url"),
        })
    }).collect();

    Ok(Json(json!({ "success": true, "data": result, "error": null })))
}

/// GET /api/badges/me — current user's badges (all badges + earned status)
async fn get_my_badges(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let badges = fetch_user_badges(&state.db, auth.user_id).await?;
    Ok(Json(json!({ "success": true, "data": badges, "error": null })))
}

/// GET /api/badges/friend/:friend_id — a friend's earned badges (only show earned ones)
async fn get_friend_badges(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(friend_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify they are friends
    let is_friend = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM connections WHERE ((requester_id = $1 AND responder_id = $2) OR (requester_id = $2 AND responder_id = $1)) AND status = 'accepted')"
    )
    .bind(auth.user_id)
    .bind(friend_id)
    .fetch_one(&state.db)
    .await?;

    if !is_friend {
        return Err(AppError::Forbidden("Not friends".to_string()));
    }

    // Return only earned badges for the friend
    use sqlx::Row;
    let rows = sqlx::query(
        r#"
        SELECT b.id, b.name, b.description, b.icon, b.category, b.threshold, b.gender, b.tier,
               b.is_sponsored, b.sponsor_name, b.sponsor_click_url, b.sponsor_logo_url,
               ub.earned_at
        FROM badges b
        JOIN user_badges ub ON ub.badge_id = b.id
        WHERE ub.user_id = $1
        ORDER BY ub.earned_at DESC
        "#
    )
    .bind(friend_id)
    .fetch_all(&state.db)
    .await?;

    let result: Vec<serde_json::Value> = rows.iter().map(|r| {
        json!({
            "id": r.get::<i32, _>("id"),
            "name": r.get::<String, _>("name"),
            "description": r.get::<String, _>("description"),
            "icon": r.get::<String, _>("icon"),
            "category": r.get::<String, _>("category"),
            "threshold": r.get::<i32, _>("threshold"),
            "gender": r.get::<String, _>("gender"),
            "tier": r.get::<String, _>("tier"),
            "is_sponsored": r.get::<bool, _>("is_sponsored"),
            "sponsor_name": r.get::<Option<String>, _>("sponsor_name"),
            "sponsor_click_url": r.get::<Option<String>, _>("sponsor_click_url"),
            "sponsor_logo_url": r.get::<Option<String>, _>("sponsor_logo_url"),
            "earned": true,
            "earned_at": r.get::<chrono::DateTime<chrono::Utc>, _>("earned_at")
        })
    }).collect();

    Ok(Json(json!({ "success": true, "data": result, "error": null })))
}

/// Fetch all badges for a user with earned status.
///
/// Earned badge'leri her zaman gösterir (kullanıcı kazandı — kampanya
/// bitse bile saklanır). Earn-lenmemiş badge'lerden sadece status='active'
/// ve kampanya penceresi içindeki olanları listeye dahil eder.
async fn fetch_user_badges(db: &sqlx::PgPool, user_id: Uuid) -> Result<Vec<serde_json::Value>, AppError> {
    use sqlx::Row;
    let rows = sqlx::query(
        r#"
        SELECT b.id, b.name, b.description, b.icon, b.category, b.threshold, b.gender, b.tier,
               b.is_sponsored, b.sponsor_name, b.sponsor_click_url, b.sponsor_logo_url,
               ub.earned_at
        FROM badges b
        LEFT JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = $1
        WHERE ub.earned_at IS NOT NULL
           OR (
             b.status = 'active'
             AND (
               b.campaign_id IS NULL
               OR EXISTS (
                 SELECT 1 FROM ad_campaigns c
                 WHERE c.id = b.campaign_id
                   AND c.deleted_at IS NULL
                   AND NOW() BETWEEN c.starts_at AND c.ends_at
               )
             )
           )
        ORDER BY b.id
        "#
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;

    let result: Vec<serde_json::Value> = rows.iter().map(|r| {
        let earned_at: Option<chrono::DateTime<chrono::Utc>> = r.get("earned_at");
        json!({
            "id": r.get::<i32, _>("id"),
            "name": r.get::<String, _>("name"),
            "description": r.get::<String, _>("description"),
            "icon": r.get::<String, _>("icon"),
            "category": r.get::<String, _>("category"),
            "threshold": r.get::<i32, _>("threshold"),
            "gender": r.get::<String, _>("gender"),
            "tier": r.get::<String, _>("tier"),
            "is_sponsored": r.get::<bool, _>("is_sponsored"),
            "sponsor_name": r.get::<Option<String>, _>("sponsor_name"),
            "sponsor_click_url": r.get::<Option<String>, _>("sponsor_click_url"),
            "sponsor_logo_url": r.get::<Option<String>, _>("sponsor_logo_url"),
            "earned": earned_at.is_some(),
            "earned_at": earned_at
        })
    }).collect();

    Ok(result)
}

/// Check and award badges for a user. Call this after date creation or friend addition.
/// Uses a single CTE query for all metrics instead of 8 separate queries.
pub async fn check_and_award_badges(db: &sqlx::PgPool, user_id: Uuid) -> Result<Vec<String>, AppError> {
    use sqlx::Row;
    let mut newly_earned: Vec<String> = Vec::new();

    // Single query: all metrics + all badges + already earned — 8 queries → 1
    let stats_row = sqlx::query(
        r#"
        SELECT
            COUNT(*) FILTER (WHERE gender = 'female') AS female_count,
            COUNT(*) FILTER (WHERE gender = 'male') AS male_count,
            COUNT(*) FILTER (WHERE gender = 'other') AS other_count,
            COUNT(DISTINCT country_code) AS country_count,
            COUNT(DISTINCT city_id) AS city_count,
            CASE WHEN COUNT(*) >= 5 THEN AVG(rating)::float8 ELSE NULL END AS avg_rating
        FROM dates
        WHERE user_id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;

    let female_date_count: i64 = stats_row.get("female_count");
    let male_date_count: i64 = stats_row.get("male_count");
    let other_date_count: i64 = stats_row.get("other_count");
    let country_count: i64 = stats_row.get("country_count");
    let city_count: i64 = stats_row.get("city_count");
    let avg_rating: Option<f64> = stats_row.get("avg_rating");

    let total_date_count = female_date_count + male_date_count + other_date_count;
    let has_both = female_date_count > 0 && male_date_count > 0;
    let has_other = other_date_count > 0;
    let lgbt_qualifying_count = if has_both || has_other { total_date_count } else { 0 };

    // Friend count (separate table, still 1 query)
    let friend_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM connections WHERE (requester_id = $1 OR responder_id = $1) AND status = 'accepted'"
    ).bind(user_id).fetch_one(db).await?;

    // Badges + earned in one round trip.
    // Yalnız status='active' badge'leri award için kullanılır; brand badge'lerinin
    // kampanya penceresi içinde olması da şart. Brand badge'leri için kampanya
    // bilgisi de okunur — award başarılı olursa ad_metrics'e impression yazılır.
    let all_badges = sqlx::query(
        r#"
        SELECT b.id, b.name, b.category, b.threshold, b.gender,
               b.criteria,
               b.campaign_id, c.placement_key, c.status AS campaign_status,
               c.is_dry_run
        FROM badges b
        LEFT JOIN ad_campaigns c ON c.id = b.campaign_id
        WHERE b.status = 'active'
          AND (
            b.campaign_id IS NULL
            OR (c.deleted_at IS NULL
                AND NOW() BETWEEN c.starts_at AND c.ends_at)
          )
        ORDER BY b.id
        "#
    )
        .fetch_all(db).await?;
    let earned_ids: Vec<i32> = sqlx::query_scalar::<_, i32>(
        "SELECT badge_id FROM user_badges WHERE user_id = $1"
    ).bind(user_id).fetch_all(db).await?;

    for badge in &all_badges {
        let badge_id: i32 = badge.get("id");
        if earned_ids.contains(&badge_id) { continue; }

        let category: String = badge.get("category");
        let threshold: i32 = badge.get("threshold");
        let gender: String = badge.get("gender");
        let criteria_json: Option<serde_json::Value> = badge.get("criteria");

        // Sponsored badge'lerin zengin kriter spec'i: NULL ise legacy yol,
        // NOT NULL ise badge_criteria::evaluate. Parse hatası badge'i unlock
        // ettirmez (defansif).
        let qualifies = if let Some(json) = criteria_json {
            match serde_json::from_value::<crate::services::badge_criteria::BadgeCriteria>(json) {
                Ok(spec) => {
                    crate::services::badge_criteria::evaluate(db, user_id, &spec)
                        .await
                        .unwrap_or(false)
                }
                Err(e) => {
                    tracing::error!(badge_id, error = %e, "badge criteria parse failed");
                    false
                }
            }
        } else {
            match (category.as_str(), gender.as_str()) {
                ("dates", "male") => female_date_count >= threshold as i64,
                ("dates", "female") => male_date_count >= threshold as i64,
                ("dates", "lgbt") => {
                    if threshold == 1 {
                        has_both || has_other
                    } else {
                        (has_both || has_other) && lgbt_qualifying_count >= threshold as i64
                    }
                },
                ("explore", _) => {
                    if badge_id <= 15 { country_count >= threshold as i64 }
                    else { city_count >= threshold as i64 }
                },
                ("quality", _) => avg_rating.map_or(false, |r| r >= threshold as f64),
                ("social", _) => friend_count >= threshold as i64,
                _ => false,
            }
        };

        if qualifies {
            let insert_result = sqlx::query(
                "INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING"
            )
                .bind(user_id).bind(badge_id).execute(db).await?;
            let name: String = badge.get("name");
            newly_earned.push(name);

            // Brand badge ise impression yaz. ON CONFLICT DO NOTHING 0 row
            // affected dönerse user zaten önceden almıştı — çift saymayız.
            if insert_result.rows_affected() > 0 {
                let campaign_id: Option<Uuid> = badge.get("campaign_id");
                let placement_key: Option<String> = badge.get("placement_key");
                let campaign_status: Option<String> = badge.get("campaign_status");
                let is_dry_run: Option<bool> = badge.get("is_dry_run");
                if let (Some(cid), Some(pkey), Some(status), Some(dry)) =
                    (campaign_id, placement_key, campaign_status, is_dry_run)
                {
                    if status == "active" && !dry {
                        sqlx::query(
                            r#"
                            INSERT INTO ad_metrics (campaign_id, date, impressions, clicks, extra)
                            VALUES ($1, CURRENT_DATE, 1, 0, '{}'::jsonb)
                            ON CONFLICT (campaign_id, date) DO UPDATE
                                SET impressions = ad_metrics.impressions + 1
                            "#,
                        )
                        .bind(cid)
                        .execute(db)
                        .await?;

                        sqlx::query(
                            r#"
                            INSERT INTO ad_placement_metrics (placement_key, date, impressions, clicks, extra)
                            VALUES ($1, CURRENT_DATE, 1, 0, '{}'::jsonb)
                            ON CONFLICT (placement_key, date) DO UPDATE
                                SET impressions = ad_placement_metrics.impressions + 1
                            "#,
                        )
                        .bind(&pkey)
                        .execute(db)
                        .await?;
                    }
                }
            }
        }
    }

    Ok(newly_earned)
}
