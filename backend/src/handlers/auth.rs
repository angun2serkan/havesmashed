use axum::extract::State;
use axum::routing::{post, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::services::{crypto, invite, wordlist};
use crate::AppState;

// ── Request / Response types ────────────────────────────────────

#[derive(Deserialize)]
pub struct RegisterRequest {
    /// Platform invite token — required for registration.
    pub invite_token: String,
}

#[derive(Serialize)]
pub struct RegisterResponse {
    pub user_id: Uuid,
    /// The 12-word secret phrase. Shown only once — user must save it.
    pub secret_phrase: String,
    pub token: String,
    pub expires_in: u64,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    /// The 12-word secret phrase separated by spaces.
    pub secret_phrase: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub expires_in: u64,
    pub user_id: Uuid,
    pub nickname: Option<String>,
}

#[derive(Deserialize)]
pub struct SetNicknameRequest {
    pub nickname: String,
}

#[derive(Serialize)]
pub struct NicknameResponse {
    pub nickname: String,
    /// A fresh JWT with the updated nickname claim.
    pub token: String,
    pub expires_in: u64,
}

#[derive(Serialize)]
pub struct DeleteAccountResponse {
    pub message: String,
    pub deletion_date: String,
}

// ── Router ──────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/nickname", put(set_nickname))
        .route("/delete-account", post(delete_account))
}

// ── Handlers ────────────────────────────────────────────────────

/// POST /api/auth/register
/// Generate a 12-word secret phrase, create user, return phrase + JWT.
async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Consume the invite token (required)
    let mut redis = state.redis.clone();
    let invite_data = invite::consume_invite(&mut redis, &body.invite_token).await?;
    match invite_data {
        None => return Err(AppError::Gone("Invite link expired or already used".to_string())),
        Some(data) => {
            if data.invite_type != invite::InviteType::Platform {
                return Err(AppError::BadRequest("Invalid invite type for registration".to_string()));
            }
        }
    }

    // Generate 12-word mnemonic
    let secret_phrase = wordlist::generate_mnemonic();
    let secret_hash = crypto::hash_secret(&secret_phrase);

    let user_id = Uuid::now_v7();

    sqlx::query("INSERT INTO users (id, secret_hash) VALUES ($1, $2)")
        .bind(user_id)
        .bind(&secret_hash)
        .execute(&state.db)
        .await?;

    let token = crypto::issue_jwt(
        user_id,
        &None,
        &state.config.jwt_secret,
        state.config.jwt_expiry_secs,
    )?;

    let resp = RegisterResponse {
        user_id,
        secret_phrase,
        token,
        expires_in: state.config.jwt_expiry_secs,
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": resp,
        "error": null
    })))
}

/// POST /api/auth/login
/// Verify 12-word secret phrase via SHA-256 indexed lookup. O(1).
async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Normalize and hash — same normalization as register
    let secret_hash = crypto::hash_secret(&body.secret_phrase);

    // Direct indexed lookup — no scanning
    let row = sqlx::query_as::<_, (Uuid, Option<String>)>(
        "SELECT id, nickname FROM users WHERE secret_hash = $1 AND is_active = TRUE",
    )
    .bind(&secret_hash)
    .fetch_optional(&state.db)
    .await?;

    let (user_id, nickname) = row
        .ok_or_else(|| AppError::Unauthorized("Invalid secret phrase".to_string()))?;

    // Update last_seen_at
    sqlx::query("UPDATE users SET last_seen_at = NOW() WHERE id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await?;

    let token = crypto::issue_jwt(
        user_id,
        &nickname,
        &state.config.jwt_secret,
        state.config.jwt_expiry_secs,
    )?;

    let resp = LoginResponse {
        token,
        expires_in: state.config.jwt_expiry_secs,
        user_id,
        nickname,
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": resp,
        "error": null
    })))
}

/// PUT /api/auth/nickname
/// Set or update the user's nickname. Required before any other action.
async fn set_nickname(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<SetNicknameRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let nickname = body.nickname.trim().to_string();

    // Validate nickname
    if nickname.len() < 3 || nickname.len() > 30 {
        return Err(AppError::BadRequest(
            "Nickname must be between 3 and 30 characters".to_string(),
        ));
    }

    if !nickname
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '.')
    {
        return Err(AppError::BadRequest(
            "Nickname can only contain letters, numbers, underscores, and dots".to_string(),
        ));
    }

    // Check uniqueness
    let existing = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM users WHERE nickname = $1 AND id != $2",
    )
    .bind(&nickname)
    .bind(auth.user_id)
    .fetch_optional(&state.db)
    .await?;

    if existing.is_some() {
        return Err(AppError::Conflict("Nickname already taken".to_string()));
    }

    sqlx::query("UPDATE users SET nickname = $1 WHERE id = $2")
        .bind(&nickname)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;

    // Issue fresh JWT with nickname
    let token = crypto::issue_jwt(
        auth.user_id,
        &Some(nickname.clone()),
        &state.config.jwt_secret,
        state.config.jwt_expiry_secs,
    )?;

    let resp = NicknameResponse {
        nickname,
        token,
        expires_in: state.config.jwt_expiry_secs,
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": resp,
        "error": null
    })))
}

/// POST /api/auth/delete-account
/// Request account deletion with 30-day grace period.
async fn delete_account(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let deletion_date = chrono::Utc::now() + chrono::Duration::days(30);

    sqlx::query(
        "UPDATE users SET is_active = FALSE, deletion_requested_at = NOW() WHERE id = $1",
    )
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    let resp = DeleteAccountResponse {
        message: "Account scheduled for deletion. You have 30 days to log in and reactivate."
            .to_string(),
        deletion_date: deletion_date.to_rfc3339(),
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": resp,
        "error": null
    })))
}
