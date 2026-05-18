// Brand entity management (super_admin only) + brand_admin self-view.
//
// Brand_admin can GET their own brand row and grants (read-only).
// All mutations (POST/PATCH/DELETE) require super_admin.
//
// Slug constraint:
//   `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`
//   2..=40 chars, lowercase alnum + tire, can't start/end with tire.
//
// "Delete" is soft via `is_active = FALSE` — brand entity is referenced
// by ad_campaigns and admin_users, so we never hard delete.

use axum::extract::{Path, State};
use axum::routing::{delete, get};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::admin_context::AdminContext;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/brands", get(list_brands).post(create_brand))
        .route(
            "/brands/{id}",
            get(get_brand).patch(update_brand).delete(deactivate_brand),
        )
        .route(
            "/brands/{id}/grants",
            get(list_grants).post(upsert_grant),
        )
        .route(
            "/brands/{id}/grants/{placement_key}",
            delete(remove_grant),
        )
}

// ════════════════════════════════════════════════════════════════
// GET /api/admin/brands
// ════════════════════════════════════════════════════════════════
//
// super_admin: full list (active + inactive, filterable via ?inactive=1)
// brand_admin: only their own brand (single-row list)

#[derive(Deserialize)]
struct ListBrandsQuery {
    /// When true, include brands with is_active=false.
    inactive: Option<bool>,
}

async fn list_brands(
    State(state): State<AppState>,
    ctx: AdminContext,
    axum::extract::Query(q): axum::extract::Query<ListBrandsQuery>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let include_inactive = q.inactive.unwrap_or(false);

    let rows = sqlx::query_as::<_, (
        Uuid,
        String,
        String,
        Option<String>,
        Option<String>,
        bool,
        DateTime<Utc>,
        Option<DateTime<Utc>>,
        i64,
    )>(
        r#"
        SELECT b.id, b.slug, b.display_name, b.contact_email,
               b.contract_notes, b.is_active, b.created_at, b.updated_at,
               COALESCE((
                   SELECT COUNT(*)::bigint FROM ad_campaigns c
                   WHERE c.brand_id = b.id AND c.deleted_at IS NULL
               ), 0) AS campaigns_count
        FROM brands b
        WHERE ($1::uuid IS NULL OR b.id = $1)
          AND ($2::boolean OR b.is_active = TRUE)
        ORDER BY b.display_name
        "#,
    )
    .bind(ctx.brand_scope())
    .bind(include_inactive)
    .fetch_all(&state.db)
    .await?;

    let brands: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.0,
                "slug": r.1,
                "display_name": r.2,
                "contact_email": r.3,
                "contract_notes": r.4,
                "is_active": r.5,
                "created_at": r.6,
                "updated_at": r.7,
                "campaigns_count": r.8,
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": brands, "error": null })))
}

// ════════════════════════════════════════════════════════════════
// POST /api/admin/brands       (super_admin only)
// ════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct CreateBrandBody {
    slug: String,
    display_name: String,
    contact_email: Option<String>,
    contract_notes: Option<String>,
}

async fn create_brand(
    State(state): State<AppState>,
    ctx: AdminContext,
    Json(body): Json<CreateBrandBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    validate_slug(&body.slug)?;
    let display_name = body.display_name.trim();
    if display_name.is_empty() || display_name.len() > 80 {
        return Err(AppError::BadRequest(
            "display_name must be 1..=80 chars".to_string(),
        ));
    }
    if let Some(ref email) = body.contact_email {
        if email.len() > 160 {
            return Err(AppError::BadRequest("contact_email too long".to_string()));
        }
    }

    let id = Uuid::now_v7();
    sqlx::query(
        r#"
        INSERT INTO brands (id, slug, display_name, contact_email, contract_notes)
        VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(id)
    .bind(&body.slug)
    .bind(display_name)
    .bind(body.contact_email.as_deref())
    .bind(body.contract_notes.as_deref())
    .execute(&state.db)
    .await
    .map_err(map_unique_violation_to_conflict)?;

    write_audit(
        &state.db,
        &ctx,
        "brand_create",
        Some("brand"),
        Some(id),
        Some(id),
        Some(json!({ "slug": body.slug, "display_name": display_name })),
    )
    .await;

    fetch_brand_response(&state.db, id).await
}

// ════════════════════════════════════════════════════════════════
// GET /api/admin/brands/:id
// ════════════════════════════════════════════════════════════════

async fn get_brand(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_brand_scope(id)?;
    fetch_brand_response(&state.db, id).await
}

// ════════════════════════════════════════════════════════════════
// PATCH /api/admin/brands/:id       (super_admin only)
// ════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct UpdateBrandBody {
    display_name: Option<String>,
    contact_email: Option<Option<String>>, // double Option = explicit null clears
    contract_notes: Option<Option<String>>,
}

async fn update_brand(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateBrandBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let before = fetch_brand_row(&state.db, id).await?;

    if let Some(ref name) = body.display_name {
        let trimmed = name.trim();
        if trimmed.is_empty() || trimmed.len() > 80 {
            return Err(AppError::BadRequest(
                "display_name must be 1..=80 chars".to_string(),
            ));
        }
    }

    sqlx::query(
        r#"
        UPDATE brands SET
            display_name   = COALESCE($2, display_name),
            contact_email  = CASE WHEN $3::boolean THEN $4 ELSE contact_email END,
            contract_notes = CASE WHEN $5::boolean THEN $6 ELSE contract_notes END,
            updated_at     = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(body.display_name.as_deref())
    .bind(body.contact_email.is_some())
    .bind(body.contact_email.as_ref().and_then(|x| x.as_deref()))
    .bind(body.contract_notes.is_some())
    .bind(body.contract_notes.as_ref().and_then(|x| x.as_deref()))
    .execute(&state.db)
    .await?;

    let after = fetch_brand_row(&state.db, id).await?;
    write_audit(
        &state.db,
        &ctx,
        "brand_update",
        Some("brand"),
        Some(id),
        Some(id),
        Some(json!({ "before": before, "after": after })),
    )
    .await;

    fetch_brand_response(&state.db, id).await
}

// ════════════════════════════════════════════════════════════════
// DELETE /api/admin/brands/:id      (super_admin only; soft)
// ════════════════════════════════════════════════════════════════

async fn deactivate_brand(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let res = sqlx::query(
        "UPDATE brands SET is_active = FALSE, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("brand {id} not found")));
    }

    write_audit(
        &state.db,
        &ctx,
        "brand_deactivate",
        Some("brand"),
        Some(id),
        Some(id),
        Some(json!({ "is_active": false })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "is_active": false },
        "error": null
    })))
}

// ════════════════════════════════════════════════════════════════
// GET  /api/admin/brands/:id/grants
// POST /api/admin/brands/:id/grants
// DELETE /api/admin/brands/:id/grants/:placement_key
// ════════════════════════════════════════════════════════════════

async fn list_grants(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_brand_scope(id)?;

    let rows = sqlx::query_as::<_, (
        Uuid,
        String,
        Option<String>,
        DateTime<Utc>,
    )>(
        r#"
        SELECT brand_id, placement_key, notes, granted_at
        FROM brand_placement_grants
        WHERE brand_id = $1
        ORDER BY placement_key
        "#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    let grants: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "brand_id": r.0,
                "placement_key": r.1,
                "notes": r.2,
                "granted_at": r.3,
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": grants, "error": null })))
}

#[derive(Deserialize)]
struct UpsertGrantBody {
    placement_key: String,
    notes: Option<String>,
}

async fn upsert_grant(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
    Json(body): Json<UpsertGrantBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    sqlx::query(
        r#"
        INSERT INTO brand_placement_grants
            (brand_id, placement_key, notes)
        VALUES ($1, $2, $3)
        ON CONFLICT (brand_id, placement_key) DO UPDATE SET
            notes = EXCLUDED.notes
        "#,
    )
    .bind(id)
    .bind(&body.placement_key)
    .bind(body.notes.as_deref())
    .execute(&state.db)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db_err) if db_err.constraint().is_some() => {
            AppError::BadRequest(format!("invalid grant: {}", db_err.message()))
        }
        _ => AppError::Sqlx(e),
    })?;

    write_audit(
        &state.db,
        &ctx,
        "brand_grant_upsert",
        Some("brand_grant"),
        Some(id),
        Some(id),
        Some(json!({
            "placement_key": body.placement_key,
            "notes": body.notes,
        })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "brand_id": id, "placement_key": body.placement_key },
        "error": null
    })))
}

async fn remove_grant(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path((id, placement_key)): Path<(Uuid, String)>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let res = sqlx::query(
        "DELETE FROM brand_placement_grants WHERE brand_id = $1 AND placement_key = $2",
    )
    .bind(id)
    .bind(&placement_key)
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound("grant not found".to_string()));
    }

    write_audit(
        &state.db,
        &ctx,
        "brand_grant_remove",
        Some("brand_grant"),
        Some(id),
        Some(id),
        Some(json!({ "placement_key": placement_key })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "brand_id": id, "placement_key": placement_key, "removed": true },
        "error": null
    })))
}

// ── helpers ───────────────────────────────────────────────────

fn validate_slug(slug: &str) -> Result<(), AppError> {
    // Mirror the DB CHECK regex so we 400 before hitting Postgres.
    let len = slug.len();
    if !(2..=40).contains(&len) {
        return Err(AppError::BadRequest("slug must be 2..=40 chars".to_string()));
    }
    let bytes = slug.as_bytes();
    let valid_char = |b: u8| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-';
    if !bytes.iter().all(|&b| valid_char(b)) {
        return Err(AppError::BadRequest(
            "slug may only contain lowercase letters, digits, and hyphens".to_string(),
        ));
    }
    if bytes[0] == b'-' || bytes[len - 1] == b'-' {
        return Err(AppError::BadRequest(
            "slug must not start or end with a hyphen".to_string(),
        ));
    }
    Ok(())
}

fn map_unique_violation_to_conflict(e: sqlx::Error) -> AppError {
    if let sqlx::Error::Database(db_err) = &e {
        if db_err.code().as_deref() == Some("23505") {
            return AppError::Conflict("slug already exists".to_string());
        }
    }
    AppError::Sqlx(e)
}

async fn fetch_brand_row(db: &sqlx::PgPool, id: Uuid) -> Result<Value, AppError> {
    let row = sqlx::query_as::<_, (
        Uuid,
        String,
        String,
        Option<String>,
        Option<String>,
        bool,
        DateTime<Utc>,
        Option<DateTime<Utc>>,
    )>(
        r#"
        SELECT id, slug, display_name, contact_email, contract_notes,
               is_active, created_at, updated_at
        FROM brands WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("brand {id} not found")))?;
    Ok(json!({
        "id": row.0,
        "slug": row.1,
        "display_name": row.2,
        "contact_email": row.3,
        "contract_notes": row.4,
        "is_active": row.5,
        "created_at": row.6,
        "updated_at": row.7,
    }))
}

async fn fetch_brand_response(
    db: &sqlx::PgPool,
    id: Uuid,
) -> Result<Json<Value>, AppError> {
    let data = fetch_brand_row(db, id).await?;
    Ok(Json(json!({ "success": true, "data": data, "error": null })))
}

/// Insert an ad_audit_log row populated from the AdminContext.
/// `target_brand_id` denormalizes which brand this mutation affected
/// so brand_admin audit listings can filter cheaply.
pub async fn write_audit(
    db: &sqlx::PgPool,
    ctx: &AdminContext,
    action: &str,
    target_kind: Option<&str>,
    target_id: Option<Uuid>,
    target_brand_id: Option<Uuid>,
    diff: Option<Value>,
) {
    let actor = match (ctx.admin_user_id, ctx.actor_name.as_deref()) {
        (Some(uid), _) => format!("admin_user:{uid}"),
        (None, Some(name)) => format!("env_super:{name}"),
        (None, None) => "env_super".to_string(),
    };
    let _ = sqlx::query(
        r#"
        INSERT INTO ad_audit_log
            (actor, action, target_kind, target_id, diff,
             admin_user_id, impersonating_brand_id, brand_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(actor)
    .bind(action)
    .bind(target_kind)
    .bind(target_id)
    .bind(diff)
    .bind(ctx.admin_user_id)
    .bind(ctx.impersonating_brand_id)
    .bind(target_brand_id)
    .execute(db)
    .await;
}
