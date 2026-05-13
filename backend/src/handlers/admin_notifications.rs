// Admin notifications inbox endpoints.
//
// Notifications are written by:
//   * services/budget_aggregator.rs — budget threshold + auto-pause
//   * handlers/admin_ads.rs — campaign_submitted / approved / rejected
//
// Read here per-user. Each admin sees only their own notifications
// (admin_user_id filter against the JWT context).

use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::admin_context::AdminContext;
use crate::AppState;

// Mounted under /api/admin. Endpoint paths avoid collision with
// admin.rs's /notifications (which broadcasts to end users).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/inbox", get(list_notifications).post(mark_all_read))
        .route("/inbox/{id}/mark-read", post(mark_one_read))
        .route("/inbox/unread-count", get(unread_count))
}

#[derive(Deserialize)]
struct ListQuery {
    /// 'all' (default), 'unread'
    filter: Option<String>,
    /// Max 200, default 50.
    limit: Option<i64>,
}

async fn list_notifications(
    State(state): State<AppState>,
    ctx: AdminContext,
    Query(q): Query<ListQuery>,
) -> Result<Json<Value>, AppError> {
    let admin_user_id = ctx
        .admin_user_id
        .ok_or_else(|| AppError::Forbidden("legacy admin key has no inbox".to_string()))?;
    ctx.require_password_changed()?;

    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let unread_only = q.filter.as_deref() == Some("unread");

    let rows = sqlx::query_as::<_, (
        Uuid,
        String,
        String,
        Option<String>,
        Value,
        Option<DateTime<Utc>>,
        DateTime<Utc>,
    )>(
        r#"
        SELECT id, type, title, body, payload, read_at, created_at
        FROM admin_notifications
        WHERE admin_user_id = $1
          AND ($2::boolean = FALSE OR read_at IS NULL)
        ORDER BY created_at DESC
        LIMIT $3
        "#,
    )
    .bind(admin_user_id)
    .bind(unread_only)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let entries: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.0,
                "type": r.1,
                "title": r.2,
                "body": r.3,
                "payload": r.4,
                "read_at": r.5,
                "created_at": r.6,
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": entries, "error": null })))
}

async fn unread_count(
    State(state): State<AppState>,
    ctx: AdminContext,
) -> Result<Json<Value>, AppError> {
    let admin_user_id = ctx
        .admin_user_id
        .ok_or_else(|| AppError::Forbidden("legacy admin key has no inbox".to_string()))?;
    ctx.require_password_changed()?;

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM admin_notifications \
         WHERE admin_user_id = $1 AND read_at IS NULL",
    )
    .bind(admin_user_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": { "count": count },
        "error": null
    })))
}

async fn mark_one_read(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let admin_user_id = ctx
        .admin_user_id
        .ok_or_else(|| AppError::Forbidden("legacy admin key has no inbox".to_string()))?;
    ctx.require_password_changed()?;

    let res = sqlx::query(
        r#"
        UPDATE admin_notifications
        SET read_at = NOW()
        WHERE id = $1 AND admin_user_id = $2 AND read_at IS NULL
        "#,
    )
    .bind(id)
    .bind(admin_user_id)
    .execute(&state.db)
    .await?;

    if res.rows_affected() == 0 {
        // Idempotent — already-read or not-yours returns ok with marked: false
        return Ok(Json(json!({
            "success": true,
            "data": { "id": id, "marked": false },
            "error": null
        })));
    }

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "marked": true },
        "error": null
    })))
}

async fn mark_all_read(
    State(state): State<AppState>,
    ctx: AdminContext,
) -> Result<Json<Value>, AppError> {
    let admin_user_id = ctx
        .admin_user_id
        .ok_or_else(|| AppError::Forbidden("legacy admin key has no inbox".to_string()))?;
    ctx.require_password_changed()?;

    let res = sqlx::query(
        "UPDATE admin_notifications SET read_at = NOW() \
         WHERE admin_user_id = $1 AND read_at IS NULL",
    )
    .bind(admin_user_id)
    .execute(&state.db)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": { "marked_count": res.rows_affected() },
        "error": null
    })))
}
