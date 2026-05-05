use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::AppState;

const MAX_PARTNERS_PER_USER: i64 = 200;
const VALID_END_REASONS: &[&str] = &[
    "distance",
    "lost_interest",
    "cheating",
    "mutual",
    "incompatibility",
    "other",
];
const VALID_HOW_WE_MET: &[&str] = &[
    "app", "friends", "work", "school", "family", "random", "other",
];

// ── Request / Response types ────────────────────────────────────

#[derive(Deserialize)]
pub struct CreatePartnerRequest {
    pub name: String,
    pub birthday: NaiveDate,
    pub relationship_start: NaiveDate,
    pub relationship_end: Option<NaiveDate>,
    pub satisfaction_score: Option<i16>,
    pub end_reason: Option<String>,
    pub how_we_met: Option<String>,
    pub notes: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdatePartnerRequest {
    pub name: Option<String>,
    pub birthday: Option<NaiveDate>,
    pub relationship_start: Option<NaiveDate>,
    /// To clear an end date pass `Some(None)` (JSON `null`); to leave unchanged omit the key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relationship_end: Option<Option<NaiveDate>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub satisfaction_score: Option<Option<i16>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_reason: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub how_we_met: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<Option<String>>,
}

#[derive(Serialize)]
pub struct PartnerResponse {
    pub id: Uuid,
    pub name: String,
    pub birthday: NaiveDate,
    pub relationship_start: NaiveDate,
    pub relationship_end: Option<NaiveDate>,
    pub satisfaction_score: Option<i16>,
    pub end_reason: Option<String>,
    pub how_we_met: Option<String>,
    pub notes: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

// ── Router ──────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_partners).post(create_partner))
        .route("/{id}", put(update_partner).delete(delete_partner))
}

// ── Validation helpers ──────────────────────────────────────────

fn validate_name(name: &str) -> Result<(), AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.len() > 60 {
        return Err(AppError::BadRequest(
            "name must be between 1 and 60 characters".to_string(),
        ));
    }
    Ok(())
}

fn validate_score(score: Option<i16>) -> Result<(), AppError> {
    if let Some(s) = score {
        if !(1..=10).contains(&s) {
            return Err(AppError::BadRequest(
                "satisfaction_score must be between 1 and 10".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_end_reason(reason: &Option<String>) -> Result<(), AppError> {
    if let Some(r) = reason {
        if !VALID_END_REASONS.contains(&r.as_str()) {
            return Err(AppError::BadRequest(format!(
                "end_reason must be one of: {}",
                VALID_END_REASONS.join(", ")
            )));
        }
    }
    Ok(())
}

fn validate_how_we_met(how: &Option<String>) -> Result<(), AppError> {
    if let Some(h) = how {
        if !VALID_HOW_WE_MET.contains(&h.as_str()) {
            return Err(AppError::BadRequest(format!(
                "how_we_met must be one of: {}",
                VALID_HOW_WE_MET.join(", ")
            )));
        }
    }
    Ok(())
}

fn validate_dates(
    birthday: NaiveDate,
    start: NaiveDate,
    end: Option<NaiveDate>,
) -> Result<(), AppError> {
    if start < birthday {
        return Err(AppError::BadRequest(
            "relationship_start cannot be before partner's birthday".to_string(),
        ));
    }
    if let Some(e) = end {
        if e < start {
            return Err(AppError::BadRequest(
                "relationship_end cannot be before relationship_start".to_string(),
            ));
        }
    }
    Ok(())
}

fn row_to_response(row: &sqlx::postgres::PgRow) -> PartnerResponse {
    PartnerResponse {
        id: row.get("id"),
        name: row.get("name"),
        birthday: row.get("birthday"),
        relationship_start: row.get("relationship_start"),
        relationship_end: row.get("relationship_end"),
        satisfaction_score: row.get("satisfaction_score"),
        end_reason: row.get("end_reason"),
        how_we_met: row.get("how_we_met"),
        notes: row.get("notes"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

// ── Handlers ────────────────────────────────────────────────────

/// GET /api/partners
async fn list_partners(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT id, name, birthday, relationship_start, relationship_end,
               satisfaction_score, end_reason, how_we_met, notes,
               created_at, updated_at
        FROM partners
        WHERE user_id = $1
        ORDER BY relationship_start DESC
        "#,
    )
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;

    let partners: Vec<PartnerResponse> = rows.iter().map(row_to_response).collect();

    Ok(Json(serde_json::json!({
        "success": true,
        "data": partners,
        "error": null
    })))
}

/// POST /api/partners
async fn create_partner(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreatePartnerRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    auth.require_nickname()?;

    validate_name(&body.name)?;
    validate_score(body.satisfaction_score)?;
    validate_end_reason(&body.end_reason)?;
    validate_how_we_met(&body.how_we_met)?;
    validate_dates(body.birthday, body.relationship_start, body.relationship_end)?;

    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM partners WHERE user_id = $1")
        .bind(auth.user_id)
        .fetch_one(&state.db)
        .await?;

    if count >= MAX_PARTNERS_PER_USER {
        return Err(AppError::LimitExceeded(format!(
            "Maximum {MAX_PARTNERS_PER_USER} partners allowed"
        )));
    }

    let id = Uuid::now_v7();
    let trimmed_name = body.name.trim().to_string();

    let row = sqlx::query(
        r#"
        INSERT INTO partners (id, user_id, name, birthday, relationship_start, relationship_end,
                              satisfaction_score, end_reason, how_we_met, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, name, birthday, relationship_start, relationship_end,
                  satisfaction_score, end_reason, how_we_met, notes,
                  created_at, updated_at
        "#,
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(&trimmed_name)
    .bind(body.birthday)
    .bind(body.relationship_start)
    .bind(body.relationship_end)
    .bind(body.satisfaction_score)
    .bind(&body.end_reason)
    .bind(&body.how_we_met)
    .bind(&body.notes)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "data": row_to_response(&row),
        "error": null
    })))
}

/// PUT /api/partners/:id
async fn update_partner(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdatePartnerRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    auth.require_nickname()?;

    // Load existing record
    let current = sqlx::query(
        r#"
        SELECT id, name, birthday, relationship_start, relationship_end,
               satisfaction_score, end_reason, how_we_met, notes,
               created_at, updated_at
        FROM partners
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(id)
    .bind(auth.user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Partner not found".to_string()))?;

    let cur_name: String = current.get("name");
    let cur_birthday: NaiveDate = current.get("birthday");
    let cur_start: NaiveDate = current.get("relationship_start");
    let cur_end: Option<NaiveDate> = current.get("relationship_end");
    let cur_score: Option<i16> = current.get("satisfaction_score");
    let cur_end_reason: Option<String> = current.get("end_reason");
    let cur_how: Option<String> = current.get("how_we_met");
    let cur_notes: Option<String> = current.get("notes");

    // Compute new values
    let new_name = body.name.as_deref().unwrap_or(&cur_name).trim().to_string();
    let new_birthday = body.birthday.unwrap_or(cur_birthday);
    let new_start = body.relationship_start.unwrap_or(cur_start);
    let new_end = match body.relationship_end {
        Some(v) => v,
        None => cur_end,
    };
    let new_score = match body.satisfaction_score {
        Some(v) => v,
        None => cur_score,
    };
    let new_end_reason = match body.end_reason {
        Some(v) => v,
        None => cur_end_reason,
    };
    let new_how = match body.how_we_met {
        Some(v) => v,
        None => cur_how,
    };
    let new_notes = match body.notes {
        Some(v) => v,
        None => cur_notes,
    };

    // Validate
    validate_name(&new_name)?;
    validate_score(new_score)?;
    validate_end_reason(&new_end_reason)?;
    validate_how_we_met(&new_how)?;
    validate_dates(new_birthday, new_start, new_end)?;

    let row = sqlx::query(
        r#"
        UPDATE partners
        SET name = $1,
            birthday = $2,
            relationship_start = $3,
            relationship_end = $4,
            satisfaction_score = $5,
            end_reason = $6,
            how_we_met = $7,
            notes = $8,
            updated_at = NOW()
        WHERE id = $9 AND user_id = $10
        RETURNING id, name, birthday, relationship_start, relationship_end,
                  satisfaction_score, end_reason, how_we_met, notes,
                  created_at, updated_at
        "#,
    )
    .bind(&new_name)
    .bind(new_birthday)
    .bind(new_start)
    .bind(new_end)
    .bind(new_score)
    .bind(&new_end_reason)
    .bind(&new_how)
    .bind(&new_notes)
    .bind(id)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "data": row_to_response(&row),
        "error": null
    })))
}

/// DELETE /api/partners/:id
async fn delete_partner(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query("DELETE FROM partners WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Partner not found".to_string()));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "id": id, "message": "Partner deleted" },
        "error": null
    })))
}
