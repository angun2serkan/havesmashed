use axum::extract::{Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::services::invite::{self, InviteData, InviteType};
use crate::AppState;

const MONTHLY_PLATFORM_INVITE_LIMIT: i64 = 3;
const TOTAL_PLATFORM_INVITE_LIMIT: i64 = 10;

// ── Request / Response types ────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateInviteRequest {
    /// "platform" (registration invite, limited) or "friend" (friend request, unlimited).
    pub invite_type: InviteType,
}

#[derive(Serialize)]
pub struct InviteResponse {
    pub invite_id: Uuid,
    pub invite_type: InviteType,
    pub link: String,
    pub expires_in_secs: u64,
}

#[derive(Deserialize)]
pub struct RespondConnectionRequest {
    /// "accept" or "reject"
    pub action: String,
}

#[derive(Deserialize)]
pub struct ListConnectionsQuery {
    pub status: Option<String>,
}

#[derive(Serialize)]
pub struct ConnectionEntry {
    pub id: Uuid,
    pub requester_id: Uuid,
    pub responder_id: Uuid,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// ── Routers ─────────────────────────────────────────────────────

pub fn invite_router() -> Router<AppState> {
    Router::new().route("/create", post(create_invite))
}

pub fn connection_router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_connections))
        .route("/respond", post(respond_connection))
}

// ── Handlers ────────────────────────────────────────────────────

/// POST /api/invites/create
/// Generate an invite link. Requires nickname.
/// Platform invites are limited (3/month, 10 total). Friend invites are unlimited.
async fn create_invite(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateInviteRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Require nickname for both invite types
    auth.require_nickname()?;

    // Enforce limits for platform invites only
    if body.invite_type == InviteType::Platform {
        let total_invites = sqlx::query_scalar::<_, i32>(
            "SELECT invite_count FROM users WHERE id = $1",
        )
        .bind(auth.user_id)
        .fetch_one(&state.db)
        .await?;

        if total_invites as i64 >= TOTAL_PLATFORM_INVITE_LIMIT {
            return Err(AppError::LimitExceeded(format!(
                "Total platform invite limit reached ({TOTAL_PLATFORM_INVITE_LIMIT})"
            )));
        }

        let month_key = format!(
            "invite:monthly:{}:{}",
            auth.user_id,
            chrono::Utc::now().format("%Y-%m")
        );

        let mut redis = state.redis.clone();
        let monthly_count: i64 = redis::cmd("GET")
            .arg(&month_key)
            .query_async::<Option<i64>>(&mut redis)
            .await
            .map_err(AppError::Redis)?
            .unwrap_or(0);

        if monthly_count >= MONTHLY_PLATFORM_INVITE_LIMIT {
            return Err(AppError::LimitExceeded(format!(
                "Monthly platform invite limit reached ({MONTHLY_PLATFORM_INVITE_LIMIT}/month)"
            )));
        }

        redis::pipe()
            .cmd("INCR")
            .arg(&month_key)
            .cmd("EXPIRE")
            .arg(&month_key)
            .arg(86400 * 31)
            .query_async::<()>(&mut redis)
            .await
            .map_err(AppError::Redis)?;

        sqlx::query("UPDATE users SET invite_count = invite_count + 1 WHERE id = $1")
            .bind(auth.user_id)
            .execute(&state.db)
            .await?;
    }

    let invite_id = Uuid::new_v4();
    let data = InviteData {
        inviter_id: auth.user_id,
        created_at: chrono::Utc::now().to_rfc3339(),
        invite_type: body.invite_type.clone(),
    };

    let mut redis = state.redis.clone();
    invite::store_invite(&mut redis, invite_id, &data).await?;

    // Build link based on type
    let link = match body.invite_type {
        InviteType::Platform => format!("havesmashed://invite/{invite_id}"),
        InviteType::Friend => format!("havesmashed://friend/{invite_id}"),
    };

    let resp = InviteResponse {
        invite_id,
        invite_type: body.invite_type,
        link,
        expires_in_secs: 86400,
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": resp,
        "error": null
    })))
}

/// POST /api/connections/respond
async fn respond_connection(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<RespondConnectionRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let new_status = match body.action.as_str() {
        "accept" => "accepted",
        "reject" => "rejected",
        _ => return Err(AppError::BadRequest("action must be 'accept' or 'reject'".to_string())),
    };

    let result = sqlx::query(
        r#"
        UPDATE connections
        SET status = $1, updated_at = NOW()
        WHERE responder_id = $2 AND status = 'pending'
        RETURNING id
        "#,
    )
    .bind(new_status)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("No pending connection found".to_string()));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "status": new_status },
        "error": null
    })))
}

/// GET /api/connections
async fn list_connections(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<ListConnectionsQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let connections = if let Some(ref status) = params.status {
        sqlx::query_as::<_, (Uuid, Uuid, Uuid, String, chrono::DateTime<chrono::Utc>)>(
            r#"
            SELECT id, requester_id, responder_id, status, created_at
            FROM connections
            WHERE (requester_id = $1 OR responder_id = $1) AND status = $2
            ORDER BY created_at DESC
            "#,
        )
        .bind(auth.user_id)
        .bind(status)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, (Uuid, Uuid, Uuid, String, chrono::DateTime<chrono::Utc>)>(
            r#"
            SELECT id, requester_id, responder_id, status, created_at
            FROM connections
            WHERE requester_id = $1 OR responder_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(auth.user_id)
        .fetch_all(&state.db)
        .await?
    };

    let entries: Vec<ConnectionEntry> = connections
        .into_iter()
        .map(|row| ConnectionEntry {
            id: row.0,
            requester_id: row.1,
            responder_id: row.2,
            status: row.3,
            created_at: row.4,
        })
        .collect();

    Ok(Json(serde_json::json!({
        "success": true,
        "data": entries,
        "error": null
    })))
}
