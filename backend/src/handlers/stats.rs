use axum::extract::{ConnectInfo, State};
use axum::http::HeaderMap;
use axum::routing::get;
use axum::{Json, Router};
use chrono::NaiveDate;
use redis::AsyncCommands;
use serde::Serialize;
use serde_json::json;
use sqlx::Row;
use std::net::SocketAddr;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::services::k_anonymity;
use crate::AppState;

#[derive(Serialize)]
pub struct StatsResponse {
    pub total_dates: i64,
    pub unique_countries: i64,
    pub unique_cities: i64,
    pub average_rating: Option<f64>,
    pub average_face_rating: Option<f64>,
    pub average_body_rating: Option<f64>,
    pub average_chat_rating: Option<f64>,
    pub current_streak: i32,
    pub longest_streak: i32,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_stats))
        .route("/public", get(get_public_stats))
}

/// GET /api/stats
async fn get_stats(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query_as::<_, (i64, i64, i64, Option<f64>, Option<f64>, Option<f64>, Option<f64>)>(
        r#"
        SELECT
            COUNT(*) AS total_dates,
            COUNT(DISTINCT country_code) AS unique_countries,
            COUNT(DISTINCT city_id) AS unique_cities,
            AVG(rating)::float8 AS average_rating,
            AVG(face_rating)::float8 AS average_face_rating,
            AVG(body_rating)::float8 AS average_body_rating,
            AVG(chat_rating)::float8 AS average_chat_rating
        FROM dates
        WHERE user_id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    let streak = sqlx::query(
        "SELECT current_streak, longest_streak FROM user_streaks WHERE user_id = $1",
    )
    .bind(auth.user_id)
    .fetch_optional(&state.db)
    .await?;

    let (current_streak, longest_streak) = match streak {
        Some(s) => (
            s.get::<i32, _>("current_streak"),
            s.get::<i32, _>("longest_streak"),
        ),
        None => (0, 0),
    };

    let resp = StatsResponse {
        total_dates: row.0,
        unique_countries: row.1,
        unique_cities: row.2,
        average_rating: row.3,
        average_face_rating: row.4,
        average_body_rating: row.5,
        average_chat_rating: row.6,
        current_streak,
        longest_streak,
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": resp,
        "error": null
    })))
}

// ── Public stats ──────────────────────────────────────────────
//
// Auth-less endpoint sourced from `daily_metrics` + `segment_metrics`.
// Both tables are written by the analytics aggregator with k≥1000 guard;
// we re-apply k-anonymity to headline numbers (which come from
// daily_metrics, no CHECK constraint) at read time.
//
// Rate-limited per IP at 60 req/min via Redis. Successful payloads
// cached in Redis for 1h.

const PUBLIC_CACHE_KEY: &str = "stats:public";
const PUBLIC_CACHE_TTL_SECS: u64 = 3600;
const RATE_LIMIT_PER_MIN: i64 = 60;

async fn get_public_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> Result<Json<serde_json::Value>, AppError> {
    let ip = client_ip(&headers, &addr);
    let mut redis = state.redis.clone();

    // Sliding-minute rate limit. Cheap and approximate — fine for read endpoint.
    let bucket = chrono::Utc::now().timestamp() / 60;
    let rl_key = format!("ratelimit:stats:public:{ip}:{bucket}");
    let count: i64 = redis
        .incr::<_, _, i64>(&rl_key, 1)
        .await
        .map_err(AppError::Redis)?;
    if count == 1 {
        let _: () = redis.expire(&rl_key, 65).await.unwrap_or(());
    }
    if count > RATE_LIMIT_PER_MIN {
        return Err(AppError::LimitExceeded(
            "Too many requests, slow down".to_string(),
        ));
    }

    if let Ok(Some(cached)) = redis.get::<_, Option<String>>(PUBLIC_CACHE_KEY).await {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&cached) {
            return Ok(Json(json!({
                "success": true,
                "data": value,
                "error": null
            })));
        }
    }

    let payload = build_public_payload(&state.db).await?;

    if let Ok(serialized) = serde_json::to_string(&payload) {
        let _: Result<(), redis::RedisError> = redis
            .set_ex(PUBLIC_CACHE_KEY, &serialized, PUBLIC_CACHE_TTL_SECS)
            .await;
    }

    Ok(Json(json!({
        "success": true,
        "data": payload,
        "error": null
    })))
}

async fn build_public_payload(db: &sqlx::PgPool) -> Result<serde_json::Value, AppError> {
    // Most recent daily_metrics row.
    let latest: Option<(NaiveDate, i32, i32, i32, i32, i32)> = sqlx::query_as(
        r#"
        SELECT date, total_users, dau, mau, total_dates_logged, new_users
        FROM daily_metrics
        ORDER BY date DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(db)
    .await?;

    let headline = match latest {
        Some((date, total_users, dau, mau, total_dates, new_users)) => json!({
            "as_of": date,
            "total_users": k_anonymity::safe_count(total_users as i64),
            "dau": k_anonymity::safe_count(dau as i64),
            "mau": k_anonymity::safe_count(mau as i64),
            "total_dates_logged": total_dates,  // not user-tied count, no k-guard needed
            "new_users_today": k_anonymity::safe_count(new_users as i64),
        }),
        None => json!(null),
    };

    let as_of: Option<NaiveDate> = latest.map(|(d, _, _, _, _, _)| d);

    // Segments — already k≥1000 by table CHECK.
    let segments_date: Option<NaiveDate> =
        sqlx::query_scalar("SELECT MAX(date) FROM segment_metrics")
            .fetch_one(db)
            .await?;

    let mut grouped: std::collections::BTreeMap<String, Vec<serde_json::Value>> =
        std::collections::BTreeMap::new();

    if let Some(d) = segments_date {
        let rows = sqlx::query_as::<_, (String, String, i32)>(
            r#"
            SELECT segment_key, segment_value, cohort_size
            FROM segment_metrics
            WHERE date = $1
            ORDER BY segment_key, cohort_size DESC
            "#,
        )
        .bind(d)
        .fetch_all(db)
        .await?;

        for (key, value, size) in rows {
            grouped
                .entry(key)
                .or_default()
                .push(json!({ "value": value, "size": size }));
        }
    }

    // 30-day mini-trend (DAU only, for sparkline).
    let trend = sqlx::query_as::<_, (NaiveDate, i32, i32)>(
        r#"
        SELECT date, dau, mau
        FROM daily_metrics
        WHERE date >= (CURRENT_DATE - 30)
        ORDER BY date ASC
        "#,
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|(d, dau, mau)| {
        json!({
            "date": d,
            "dau": k_anonymity::safe_count(dau as i64),
            "mau": k_anonymity::safe_count(mau as i64),
        })
    })
    .collect::<Vec<_>>();

    Ok(json!({
        "as_of": as_of,
        "headline": headline,
        "segments": grouped,
        "trend_30d": trend,
        "k_threshold": k_anonymity::K_THRESHOLD,
        "anonymity_note": "All figures are aggregated. Cohorts below k=1000 are suppressed. No user identifiers are exposed.",
    }))
}

fn client_ip(headers: &HeaderMap, addr: &SocketAddr) -> String {
    // Prefer X-Forwarded-For (set by nginx in prod). First entry is the real client.
    if let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = xff.split(',').next() {
            let trimmed = first.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    addr.ip().to_string()
}
