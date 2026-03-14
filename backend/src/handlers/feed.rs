use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::AppState;

#[derive(Serialize)]
pub struct FeedResponse {
    pub message: String,
    pub friends_active_this_week: i64,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(get_feed))
}

/// GET /api/feed
/// Aggregate feed: "N friends added dates this week".
async fn get_feed(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let friend_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(DISTINCT friend_id)
        FROM (
            SELECT
                CASE
                    WHEN requester_id = $1 THEN responder_id
                    ELSE requester_id
                END AS friend_id
            FROM connections
            WHERE (requester_id = $1 OR responder_id = $1)
              AND status = 'accepted'
        ) AS friends
        WHERE EXISTS (
            SELECT 1
            FROM dates
            WHERE user_id = friends.friend_id
              AND deleted_at IS NULL
              AND created_at >= NOW() - INTERVAL '7 days'
        )
        "#,
    )
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    let message = if friend_count == 0 {
        "No friends added dates this week".to_string()
    } else if friend_count == 1 {
        "1 friend added dates this week".to_string()
    } else {
        format!("{friend_count} friends added dates this week")
    };

    let resp = FeedResponse {
        message,
        friends_active_this_week: friend_count,
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": resp,
        "error": null
    })))
}
