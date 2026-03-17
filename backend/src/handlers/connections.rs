use axum::extract::{Path, Query, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
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
    pub invite_type: InviteType,
}

#[derive(Serialize)]
pub struct InviteResponse {
    pub token: String,
    pub invite_type: InviteType,
    pub link: String,
    pub expires_in_secs: u64,
}

#[derive(Deserialize)]
pub struct RespondConnectionRequest {
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
    pub friend_nickname: Option<String>,
    pub top_badge_icon: Option<String>,
    pub color: String,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
pub struct SetColorRequest {
    pub color: String,
}

// ── Routers ─────────────────────────────────────────────────────

pub fn invite_router() -> Router<AppState> {
    Router::new()
        .route("/create", post(create_invite))
        .route("/{token}", get(get_invite))
}

pub fn connection_router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_connections))
        .route("/respond", post(respond_connection))
        .route("/add", post(add_friend_by_code))
        .route("/{id}", axum::routing::delete(delete_connection))
        .route("/{id}/color", put(set_friend_color))
}

// ── Handlers ────────────────────────────────────────────────────

/// POST /api/invites/create
async fn create_invite(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateInviteRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    auth.require_nickname()?;

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

    let data = InviteData {
        inviter_id: auth.user_id,
        created_at: chrono::Utc::now().to_rfc3339(),
        invite_type: body.invite_type.clone(),
    };

    let base_url = std::env::var("FRONTEND_URL")
        .unwrap_or_else(|_| "http://localhost:5173".to_string());

    let mut redis = state.redis.clone();

    let (token, link) = match body.invite_type {
        InviteType::Platform => {
            let token = invite::generate_token();
            invite::store_invite(&mut redis, &token, &data).await?;
            let link = format!("{base_url}/invite/{token}");
            (token, link)
        }
        InviteType::Friend => {
            let code = invite::generate_friend_code();
            invite::store_friend_code(&mut redis, &code, &data).await?;
            let link = format!("{base_url}/login?friend_code={code}");
            (code, link)
        }
    };

    let resp = InviteResponse {
        token,
        invite_type: body.invite_type,
        link,
        expires_in_secs: 86400,
    };

    Ok(Json(json!({
        "success": true,
        "data": resp,
        "error": null
    })))
}

/// GET /api/invites/:token — Preview invite without consuming it.
async fn get_invite(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Validate token format (base64url, 32 chars)
    if token.len() != 32 || !token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(AppError::BadRequest("Invalid invite token".to_string()));
    }

    let mut redis = state.redis.clone();
    let key = format!("invite:{token}");
    let value: Option<String> = redis::cmd("GET")
        .arg(&key)
        .query_async(&mut redis)
        .await
        .map_err(AppError::Redis)?;

    match value {
        Some(json_str) => {
            let data: InviteData = serde_json::from_str(&json_str)
                .map_err(|e| AppError::Internal(format!("Deserialize: {e}")))?;
            Ok(Json(json!({
                "success": true,
                "data": {
                    "token": token,
                    "invite_type": data.invite_type,
                    "inviter_id": data.inviter_id,
                    "valid": true
                },
                "error": null
            })))
        }
        None => Err(AppError::Gone("Invite expired or already used".to_string())),
    }
}

#[derive(Deserialize)]
pub struct AddFriendRequest {
    pub code: String,
}

/// POST /api/connections/add
/// Enter a friend code to add someone as a friend.
async fn add_friend_by_code(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<AddFriendRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let code = body.code.trim().to_uppercase();

    if code.len() != 8 || !code.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(AppError::BadRequest("Invalid friend code".to_string()));
    }

    let mut redis = state.redis.clone();
    let invite_data = invite::consume_friend_code(&mut redis, &code).await?;

    match invite_data {
        None => Err(AppError::Gone("Friend code expired or already used".to_string())),
        Some(data) => {
            if data.invite_type != InviteType::Friend {
                return Err(AppError::BadRequest("Invalid code type".to_string()));
            }

            if data.inviter_id == auth.user_id {
                return Err(AppError::BadRequest("Cannot add yourself".to_string()));
            }

            let existing = sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM connections WHERE (requester_id = $1 AND responder_id = $2) OR (requester_id = $2 AND responder_id = $1)",
            )
            .bind(data.inviter_id)
            .bind(auth.user_id)
            .fetch_optional(&state.db)
            .await?;

            if existing.is_some() {
                return Err(AppError::Conflict("Already friends".to_string()));
            }

            let conn_id = Uuid::now_v7();
            sqlx::query(
                "INSERT INTO connections (id, requester_id, responder_id, status) VALUES ($1, $2, $3, 'accepted')",
            )
            .bind(conn_id)
            .bind(data.inviter_id)
            .bind(auth.user_id)
            .execute(&state.db)
            .await?;

            // Check for new badges for both users
            let _ = crate::handlers::badges::check_and_award_badges(&state.db, auth.user_id).await;
            let _ = crate::handlers::badges::check_and_award_badges(&state.db, data.inviter_id).await;

            Ok(Json(json!({
                "success": true,
                "data": {
                    "connection_id": conn_id,
                    "status": "accepted"
                },
                "error": null
            })))
        }
    }
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

    Ok(Json(json!({
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
        sqlx::query(
            r#"
            SELECT c.id, c.requester_id, c.responder_id,
                   CASE WHEN c.requester_id = $1 THEN u2.nickname ELSE u1.nickname END AS friend_nickname,
                   (SELECT b.icon FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
                    WHERE ub.user_id = CASE WHEN c.requester_id = $1 THEN c.responder_id ELSE c.requester_id END
                    ORDER BY b.id DESC LIMIT 1) AS top_badge_icon,
                   c.color, c.status, c.created_at
            FROM connections c
            JOIN users u1 ON u1.id = c.requester_id
            JOIN users u2 ON u2.id = c.responder_id
            WHERE (c.requester_id = $1 OR c.responder_id = $1) AND c.status = $2
            ORDER BY c.created_at DESC
            "#,
        )
        .bind(auth.user_id)
        .bind(status)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query(
            r#"
            SELECT c.id, c.requester_id, c.responder_id,
                   CASE WHEN c.requester_id = $1 THEN u2.nickname ELSE u1.nickname END AS friend_nickname,
                   (SELECT b.icon FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
                    WHERE ub.user_id = CASE WHEN c.requester_id = $1 THEN c.responder_id ELSE c.requester_id END
                    ORDER BY b.id DESC LIMIT 1) AS top_badge_icon,
                   c.color, c.status, c.created_at
            FROM connections c
            JOIN users u1 ON u1.id = c.requester_id
            JOIN users u2 ON u2.id = c.responder_id
            WHERE c.requester_id = $1 OR c.responder_id = $1
            ORDER BY c.created_at DESC
            "#,
        )
        .bind(auth.user_id)
        .fetch_all(&state.db)
        .await?
    };

    let entries: Vec<ConnectionEntry> = connections
        .into_iter()
        .map(|row| ConnectionEntry {
            id: row.get("id"),
            requester_id: row.get("requester_id"),
            responder_id: row.get("responder_id"),
            friend_nickname: row.get("friend_nickname"),
            top_badge_icon: row.get("top_badge_icon"),
            color: row.get("color"),
            status: row.get("status"),
            created_at: row.get("created_at"),
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": entries,
        "error": null
    })))
}

/// DELETE /api/connections/:id
async fn delete_connection(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query(
        "DELETE FROM connections WHERE id = $1 AND (requester_id = $2 OR responder_id = $2)",
    )
    .bind(id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Connection not found".to_string()));
    }

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "message": "Connection removed" },
        "error": null
    })))
}

/// PUT /api/connections/:id/color
async fn set_friend_color(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<SetColorRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Validate hex color format: #RRGGBB
    let color = body.color.trim().to_uppercase();
    if !color.starts_with('#') || color.len() != 7 || !color[1..].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::BadRequest("Color must be hex format #RRGGBB".to_string()));
    }

    let result = sqlx::query(
        "UPDATE connections SET color = $1 WHERE id = $2 AND (requester_id = $3 OR responder_id = $3)"
    )
    .bind(&color)
    .bind(id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Connection not found".to_string()));
    }

    Ok(Json(json!({ "success": true, "data": { "color": color }, "error": null })))
}
