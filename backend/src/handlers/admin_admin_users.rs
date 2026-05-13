// Admin user management — super_admin invites, deactivates, resets
// passwords; brand_admin can only view their own profile via /me
// (handled in admin_auth.rs).
//
// T0.3 contract:
//   * Every invite + every super-initiated reset sets
//     `must_change_password = TRUE`. The recipient is forced to
//     replace the temp password on first login. Super_admin sees
//     the temp_password exactly once (create / reset response).
//   * `password_hash` is never returned.
//
// "Delete" is soft via is_active = FALSE — admin_users rows are
// referenced by audit_log.admin_user_id.

use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::error::AppError;
use crate::handlers::admin_brands::write_audit;
use crate::middleware::admin_context::AdminContext;
use crate::services::password;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin-users", get(list_users).post(create_user))
        .route("/admin-users/{id}", get(get_user).patch(update_user))
        .route("/admin-users/{id}/reset-password", post(reset_password))
}

// ════════════════════════════════════════════════════════════════
// GET /api/admin/admin-users
// ════════════════════════════════════════════════════════════════

async fn list_users(
    State(state): State<AppState>,
    ctx: AdminContext,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let rows = sqlx::query_as::<_, (
        Uuid,
        String,
        String,
        String,
        Option<Uuid>,
        bool,
        bool,
        Option<DateTime<Utc>>,
        Option<DateTime<Utc>>,
        DateTime<Utc>,
    )>(
        r#"
        SELECT id, email, display_name, role, brand_id, is_active,
               must_change_password, password_changed_at, last_login_at,
               created_at
        FROM admin_users
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    let users: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.0,
                "email": r.1,
                "display_name": r.2,
                "role": r.3,
                "brand_id": r.4,
                "is_active": r.5,
                "must_change_password": r.6,
                "password_changed_at": r.7,
                "last_login_at": r.8,
                "created_at": r.9,
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": users, "error": null })))
}

// ════════════════════════════════════════════════════════════════
// POST /api/admin/admin-users
// ════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct CreateUserBody {
    email: String,
    display_name: String,
    role: String,
    brand_id: Option<Uuid>,
    /// Optional. If omitted, server generates a 16-char random password.
    initial_password: Option<String>,
}

async fn create_user(
    State(state): State<AppState>,
    ctx: AdminContext,
    Json(body): Json<CreateUserBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    // super_admin artık env-tabanlı; tabloya yalnızca brand_admin girilebilir.
    let role = body.role.trim();
    if role != "brand_admin" {
        return Err(AppError::BadRequest(
            "role must be 'brand_admin' (super_admin is env-managed)".to_string(),
        ));
    }
    if body.brand_id.is_none() {
        return Err(AppError::BadRequest(
            "brand_admin requires brand_id".to_string(),
        ));
    }

    // For brand_admin, verify brand exists and is active
    if let Some(brand_id) = body.brand_id {
        let exists: Option<bool> =
            sqlx::query_scalar("SELECT is_active FROM brands WHERE id = $1")
                .bind(brand_id)
                .fetch_optional(&state.db)
                .await?;
        match exists {
            Some(true) => {}
            Some(false) => {
                return Err(AppError::BadRequest("brand is inactive".to_string()))
            }
            None => {
                return Err(AppError::NotFound(format!("brand {brand_id} not found")))
            }
        }
    }

    // Email validation (light — RFC compliance not enforced)
    let email = body.email.trim().to_lowercase();
    if email.is_empty() || email.len() > 160 || !email.contains('@') {
        return Err(AppError::BadRequest("invalid email".to_string()));
    }

    let display_name = body.display_name.trim();
    if display_name.is_empty() || display_name.len() > 80 {
        return Err(AppError::BadRequest(
            "display_name must be 1..=80 chars".to_string(),
        ));
    }

    // Resolve password
    let password_generated = body.initial_password.is_none();
    let temp_password = match body.initial_password {
        Some(p) => {
            password::validate_password_policy(&p)?;
            p
        }
        None => password::generate_random_password(),
    };
    let hash = password::hash_password(&temp_password)?;

    let id = Uuid::now_v7();
    sqlx::query(
        r#"
        INSERT INTO admin_users
            (id, email, password_hash, display_name, role, brand_id,
             must_change_password)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        "#,
    )
    .bind(id)
    .bind(&email)
    .bind(&hash)
    .bind(display_name)
    .bind(role)
    .bind(body.brand_id)
    .execute(&state.db)
    .await
    .map_err(map_unique_violation_to_conflict)?;

    write_audit(
        &state.db,
        &ctx,
        "admin_user_create",
        Some("admin_user"),
        Some(id),
        body.brand_id,
        Some(json!({
            "email": email,
            "role": role,
            "brand_id": body.brand_id,
            "password_generated": password_generated,
        })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": {
            "admin_user": {
                "id": id,
                "email": email,
                "display_name": display_name,
                "role": role,
                "brand_id": body.brand_id,
                "is_active": true,
                "must_change_password": true,
            },
            // Returned exactly once; never queryable afterwards.
            "temp_password": temp_password,
        },
        "error": null,
    })))
}

// ════════════════════════════════════════════════════════════════
// GET /api/admin/admin-users/:id
// ════════════════════════════════════════════════════════════════

async fn get_user(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    // Either super_admin OR the user is querying themselves.
    let is_self = ctx.admin_user_id == Some(id);
    if !is_self {
        ctx.require_super()?;
    }

    let row: Option<(
        Uuid,
        String,
        String,
        String,
        Option<Uuid>,
        bool,
        bool,
        Option<DateTime<Utc>>,
        Option<DateTime<Utc>>,
        DateTime<Utc>,
    )> = sqlx::query_as(
        r#"
        SELECT id, email, display_name, role, brand_id, is_active,
               must_change_password, password_changed_at, last_login_at,
               created_at
        FROM admin_users
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    let row = row.ok_or_else(|| AppError::NotFound(format!("admin_user {id} not found")))?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": row.0,
            "email": row.1,
            "display_name": row.2,
            "role": row.3,
            "brand_id": row.4,
            "is_active": row.5,
            "must_change_password": row.6,
            "password_changed_at": row.7,
            "last_login_at": row.8,
            "created_at": row.9,
        },
        "error": null,
    })))
}

// ════════════════════════════════════════════════════════════════
// PATCH /api/admin/admin-users/:id   (super only)
// ════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct UpdateUserBody {
    display_name: Option<String>,
    is_active: Option<bool>,
    role: Option<String>,
    brand_id: Option<Option<Uuid>>, // explicit null clears
}

async fn update_user(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateUserBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    // Prevent locking yourself out
    if Some(id) == ctx.admin_user_id && body.is_active == Some(false) {
        return Err(AppError::BadRequest(
            "cannot deactivate your own account".to_string(),
        ));
    }

    if let Some(ref name) = body.display_name {
        let trimmed = name.trim();
        if trimmed.is_empty() || trimmed.len() > 80 {
            return Err(AppError::BadRequest(
                "display_name must be 1..=80 chars".to_string(),
            ));
        }
    }
    if let Some(ref r) = body.role {
        if r != "brand_admin" {
            return Err(AppError::BadRequest(
                "role must remain 'brand_admin'".to_string(),
            ));
        }
    }

    // Fetch current row for audit + validation
    let before: (String, String, Option<Uuid>, bool) = sqlx::query_as(
        "SELECT display_name, role, brand_id, is_active FROM admin_users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("admin_user {id} not found")))?;

    // Compute effective brand_id for consistency check (DB CHECK
    // will also enforce, but we want a nice error before hitting it).
    let effective_role = body.role.as_deref().unwrap_or(&before.1).to_string();
    let effective_brand_id = match &body.brand_id {
        Some(opt) => *opt,
        None => before.2,
    };
    if effective_role != "brand_admin" || effective_brand_id.is_none() {
        return Err(AppError::BadRequest(
            "admin_users may only hold brand_admin rows with a brand_id".to_string(),
        ));
    }

    sqlx::query(
        r#"
        UPDATE admin_users SET
            display_name = COALESCE($2, display_name),
            is_active    = COALESCE($3, is_active),
            role         = COALESCE($4, role),
            brand_id     = CASE WHEN $5::boolean THEN $6 ELSE brand_id END
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(body.display_name.as_deref())
    .bind(body.is_active)
    .bind(body.role.as_deref())
    .bind(body.brand_id.is_some())
    .bind(body.brand_id.as_ref().and_then(|x| *x))
    .execute(&state.db)
    .await?;

    write_audit(
        &state.db,
        &ctx,
        "admin_user_update",
        Some("admin_user"),
        Some(id),
        effective_brand_id,
        Some(json!({
            "before": {
                "display_name": before.0,
                "role": before.1,
                "brand_id": before.2,
                "is_active": before.3,
            },
            "patch": {
                "display_name": body.display_name,
                "role": body.role,
                "brand_id": body.brand_id,
                "is_active": body.is_active,
            },
        })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "updated": true },
        "error": null,
    })))
}

// ════════════════════════════════════════════════════════════════
// POST /api/admin/admin-users/:id/reset-password    (super only)
// ════════════════════════════════════════════════════════════════
//
// Generates a fresh random temp_password, sets must_change_password
// = TRUE, and returns the temp_password ONCE. Brand_admin "I forgot
// my password" path goes through super_admin manual reset until
// T7.1 (email forgot-password flow) lands.

async fn reset_password(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    // Confirm user exists + active
    let user: Option<(bool, Option<Uuid>)> =
        sqlx::query_as("SELECT is_active, brand_id FROM admin_users WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    let (is_active, target_brand_id) = user
        .ok_or_else(|| AppError::NotFound(format!("admin_user {id} not found")))?;
    if !is_active {
        return Err(AppError::BadRequest(
            "cannot reset password for disabled user".to_string(),
        ));
    }

    let temp_password = password::generate_random_password();
    let hash = password::hash_password(&temp_password)?;

    sqlx::query(
        r#"
        UPDATE admin_users
        SET password_hash = $2,
            must_change_password = TRUE
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(&hash)
    .execute(&state.db)
    .await?;

    write_audit(
        &state.db,
        &ctx,
        "admin_user_password_reset",
        Some("admin_user"),
        Some(id),
        target_brand_id,
        Some(json!({ "by_super_admin": true })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": id,
            "temp_password": temp_password,
            "must_change_password": true,
        },
        "error": null,
    })))
}

// ── helpers ───────────────────────────────────────────────────

fn map_unique_violation_to_conflict(e: sqlx::Error) -> AppError {
    if let sqlx::Error::Database(db_err) = &e {
        if db_err.code().as_deref() == Some("23505") {
            return AppError::Conflict("email already exists".to_string());
        }
        if db_err.code().as_deref() == Some("23514") {
            // CHECK violation (role/brand_id consistency)
            return AppError::BadRequest(format!(
                "role/brand_id consistency violation: {}",
                db_err.message()
            ));
        }
    }
    AppError::Sqlx(e)
}
