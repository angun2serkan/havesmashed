use axum::extract::State;
use axum::http::HeaderMap;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::error::AppError;
use crate::AppState;

#[derive(Serialize)]
pub struct AdminMetrics {
    pub total_users: i64,
    pub total_dates: i64,
    pub daily_active_users: i64,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/metrics", get(get_metrics))
}

/// GET /api/admin/metrics
async fn get_metrics(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let admin_key = headers
        .get("x-admin-key")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing X-Admin-Key header".to_string()))?;

    if admin_key != state.config.admin_api_key {
        return Err(AppError::Forbidden("Invalid admin key".to_string()));
    }

    let total_users = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM users WHERE is_active = TRUE",
    )
    .fetch_one(&state.db)
    .await?;

    let total_dates = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM dates WHERE deleted_at IS NULL",
    )
    .fetch_one(&state.db)
    .await?;

    let daily_active_users = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM users WHERE last_seen_at >= NOW() - INTERVAL '24 hours' AND is_active = TRUE",
    )
    .fetch_one(&state.db)
    .await?;

    let resp = AdminMetrics {
        total_users,
        total_dates,
        daily_active_users,
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": resp,
        "error": null
    })))
}
