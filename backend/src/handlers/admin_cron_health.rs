// Cron sağlığı endpoint'leri.
//
// `impression_cap_enforcer` günlük çalışır, çalışmazsa cap'i aşan
// kampanyalar süresiz yayında kalır. Bu modül:
//   * Heartbeat status (Redis'ten okur)
//   * `cron_health_log` listeleme (geçmiş olaylar)
//   * Manuel tetikleme (super admin VPS müdahalesinden önce dener)

use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Duration, Utc};
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::admin_context::AdminContext;
use crate::services::{impression_cap_enforcer, wallet_reconciler};
use crate::AppState;

pub const CAP_ENFORCER_NAME: &str = "impression_cap_enforcer";
pub const CAP_ENFORCER_LAST_RUN_KEY: &str = "cap_enforcer:last_run";
pub const STALE_THRESHOLD_HOURS: i64 = 25;

/// İzlenen tüm cron'lar — heartbeat key + display name.
const TRACKED_CRONS: &[(&str, &str)] = &[
    (CAP_ENFORCER_NAME, CAP_ENFORCER_LAST_RUN_KEY),
    (wallet_reconciler::CRON_NAME, wallet_reconciler::LAST_RUN_KEY),
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/cron-health/status", get(status))
        .route("/cron-health/log", get(list_log))
        .route("/cron-health/trigger/{name}", post(trigger))
}

// ── GET /cron-health/status ───────────────────────────────────

async fn status(
    State(state): State<AppState>,
    ctx: AdminContext,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_super()?;

    let mut redis = state.redis.clone();
    let mut entries: Vec<Value> = Vec::with_capacity(TRACKED_CRONS.len());

    for (name, redis_key) in TRACKED_CRONS {
        let last_run_iso: Option<String> = redis.get::<_, String>(*redis_key).await.ok();
        let last_run_dt: Option<DateTime<Utc>> = last_run_iso
            .as_deref()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.with_timezone(&Utc));

        let stale = match last_run_dt {
            None => true,
            Some(dt) => (Utc::now() - dt) > Duration::hours(STALE_THRESHOLD_HOURS),
        };

        if stale {
            let already_today: bool = sqlx::query_scalar(
                r#"
                SELECT EXISTS(
                    SELECT 1 FROM cron_health_log
                    WHERE cron_name = $1
                      AND event = 'stale_observed'
                      AND observed_at::date = CURRENT_DATE
                )
                "#,
            )
            .bind(*name)
            .fetch_one(&state.db)
            .await?;

            if !already_today {
                sqlx::query(
                    r#"
                    INSERT INTO cron_health_log (cron_name, event, detail)
                    VALUES ($1, 'stale_observed', $2)
                    "#,
                )
                .bind(*name)
                .bind(format!(
                    "last_run={:?}",
                    last_run_iso.as_deref().unwrap_or("(missing)")
                ))
                .execute(&state.db)
                .await?;
            }
        }

        entries.push(json!({
            "name": name,
            "last_run": last_run_iso,
            "stale": stale,
            "stale_threshold_hours": STALE_THRESHOLD_HOURS,
        }));
    }

    Ok(Json(json!({
        "success": true,
        "data": { "crons": entries },
        "error": null
    })))
}

// ── GET /cron-health/log ──────────────────────────────────────

#[derive(Deserialize)]
struct LogQuery {
    cron_name: Option<String>,
    event: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn list_log(
    State(state): State<AppState>,
    ctx: AdminContext,
    Query(q): Query<LogQuery>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_super()?;

    let limit = q.limit.unwrap_or(50).clamp(1, 500);
    let offset = q.offset.unwrap_or(0).max(0);

    let rows: Vec<(Uuid, String, String, Option<String>, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT id, cron_name, event, detail, observed_at
        FROM cron_health_log
        WHERE ($1::varchar IS NULL OR cron_name = $1)
          AND ($2::varchar IS NULL OR event = $2)
        ORDER BY observed_at DESC
        LIMIT $3 OFFSET $4
        "#,
    )
    .bind(q.cron_name.as_deref())
    .bind(q.event.as_deref())
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    let items: Vec<Value> = rows
        .into_iter()
        .map(|(id, cron, event, detail, ts)| {
            json!({
                "id": id,
                "cron_name": cron,
                "event": event,
                "detail": detail,
                "observed_at": ts,
            })
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": { "items": items, "limit": limit, "offset": offset },
        "error": null
    })))
}

// ── POST /cron-health/trigger/{name} ──────────────────────────

async fn trigger(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(name): Path<String>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_super()?;

    match name.as_str() {
        n if n == CAP_ENFORCER_NAME => {
            let summary = impression_cap_enforcer::run_once(&state).await?;
            Ok(Json(json!({
                "success": true,
                "data": {
                    "cron_name": CAP_ENFORCER_NAME,
                    "triggered_at": Utc::now(),
                    "summary": {
                        "processed": summary.processed,
                        "paused": summary.paused,
                    }
                },
                "error": null
            })))
        }
        n if n == wallet_reconciler::CRON_NAME => {
            let summary = wallet_reconciler::run_once(&state).await?;
            Ok(Json(json!({
                "success": true,
                "data": {
                    "cron_name": wallet_reconciler::CRON_NAME,
                    "triggered_at": Utc::now(),
                    "summary": {
                        "processed": summary.processed,
                        "matched": summary.matched,
                        "mismatched": summary.mismatched,
                    }
                },
                "error": null
            })))
        }
        other => Err(AppError::NotFound(format!("unknown cron: {other}"))),
    }
}
