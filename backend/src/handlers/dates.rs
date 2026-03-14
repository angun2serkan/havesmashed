use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::AppState;

const MAX_DATES_PER_USER: i64 = 1000;
const VALID_GENDERS: &[&str] = &["male", "female", "other"];
const VALID_AGE_RANGES: &[&str] = &["18-22", "23-27", "28-32", "33-37", "38-42", "43-47", "48+"];

// ── Request / Response types ────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateDateRequest {
    pub country_code: String,
    pub city_id: i32,
    pub gender: String,
    pub age_range: String,
    pub description: Option<String>,
    pub rating: i32,
    pub date_at: NaiveDate,
    pub tag_ids: Vec<i32>,
}

#[derive(Deserialize)]
pub struct UpdateDateRequest {
    pub country_code: Option<String>,
    pub city_id: Option<i32>,
    pub gender: Option<String>,
    pub age_range: Option<String>,
    pub description: Option<String>,
    pub rating: Option<i32>,
    pub date_at: Option<NaiveDate>,
    pub tag_ids: Option<Vec<i32>>,
}

#[derive(Deserialize)]
pub struct ListDatesQuery {
    pub cursor: Option<Uuid>,
    pub limit: Option<i64>,
}

#[derive(Serialize)]
pub struct DateResponse {
    pub id: Uuid,
    pub country_code: String,
    pub city_id: i32,
    pub gender: String,
    pub age_range: String,
    pub description: Option<String>,
    pub rating: i32,
    pub date_at: NaiveDate,
    pub tag_ids: Vec<i32>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Serialize)]
pub struct DateListResponse {
    pub dates: Vec<DateResponse>,
    pub next_cursor: Option<Uuid>,
}

// ── Router ──────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(create_date).get(list_dates))
        .route("/{id}", get(get_date).put(update_date).delete(delete_date))
}

// ── Helpers ─────────────────────────────────────────────────────

fn validate_gender(gender: &str) -> Result<(), AppError> {
    if !VALID_GENDERS.contains(&gender) {
        return Err(AppError::BadRequest(format!(
            "gender must be one of: {}",
            VALID_GENDERS.join(", ")
        )));
    }
    Ok(())
}

fn validate_age_range(age_range: &str) -> Result<(), AppError> {
    if !VALID_AGE_RANGES.contains(&age_range) {
        return Err(AppError::BadRequest(format!(
            "age_range must be one of: {}",
            VALID_AGE_RANGES.join(", ")
        )));
    }
    Ok(())
}

fn validate_rating(rating: i32) -> Result<(), AppError> {
    if !(1..=10).contains(&rating) {
        return Err(AppError::BadRequest("rating must be between 1 and 10".to_string()));
    }
    Ok(())
}

async fn fetch_tag_ids(db: &sqlx::PgPool, date_id: Uuid) -> Result<Vec<i32>, AppError> {
    let tags = sqlx::query_scalar::<_, i32>(
        "SELECT tag_id FROM date_tags WHERE date_id = $1 ORDER BY tag_id",
    )
    .bind(date_id)
    .fetch_all(db)
    .await?;
    Ok(tags)
}

async fn replace_tags(db: &sqlx::PgPool, date_id: Uuid, tag_ids: &[i32]) -> Result<(), AppError> {
    // Delete existing tags
    sqlx::query("DELETE FROM date_tags WHERE date_id = $1")
        .bind(date_id)
        .execute(db)
        .await?;

    // Insert new tags
    for &tag_id in tag_ids {
        sqlx::query("INSERT INTO date_tags (date_id, tag_id) VALUES ($1, $2)")
            .bind(date_id)
            .bind(tag_id)
            .execute(db)
            .await?;
    }
    Ok(())
}

// ── Handlers ────────────────────────────────────────────────────

/// POST /api/dates
async fn create_date(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateDateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Require nickname
    auth.require_nickname()?;

    // Validate fields
    if body.country_code.len() != 2 {
        return Err(AppError::BadRequest("country_code must be ISO 3166-1 alpha-2".to_string()));
    }
    validate_gender(&body.gender)?;
    validate_age_range(&body.age_range)?;
    validate_rating(body.rating)?;

    // Check date limit
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM dates WHERE user_id = $1 AND deleted_at IS NULL",
    )
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    if count >= MAX_DATES_PER_USER {
        return Err(AppError::LimitExceeded(format!(
            "Maximum {MAX_DATES_PER_USER} dates allowed"
        )));
    }

    // Verify city exists
    let city_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM cities WHERE id = $1 AND country_code = $2)",
    )
    .bind(body.city_id)
    .bind(&body.country_code)
    .fetch_one(&state.db)
    .await?;

    if !city_exists {
        return Err(AppError::BadRequest("City not found for the given country".to_string()));
    }

    let id = Uuid::now_v7();

    sqlx::query(
        r#"
        INSERT INTO dates (id, user_id, country_code, city_id, gender, age_range, description, rating, date_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(&body.country_code)
    .bind(body.city_id)
    .bind(&body.gender)
    .bind(&body.age_range)
    .bind(&body.description)
    .bind(body.rating)
    .bind(body.date_at)
    .execute(&state.db)
    .await?;

    // Insert tags
    replace_tags(&state.db, id, &body.tag_ids).await?;

    let resp = DateResponse {
        id,
        country_code: body.country_code,
        city_id: body.city_id,
        gender: body.gender,
        age_range: body.age_range,
        description: body.description,
        rating: body.rating,
        date_at: body.date_at,
        tag_ids: body.tag_ids,
        created_at: chrono::Utc::now(),
        updated_at: None,
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": resp,
        "error": null
    })))
}

/// GET /api/dates
async fn list_dates(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<ListDatesQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let limit = params.limit.unwrap_or(50).min(100);

    let rows = if let Some(cursor) = params.cursor {
        sqlx::query_as::<_, (Uuid, String, i32, String, String, Option<String>, i32, NaiveDate, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)>(
            r#"
            SELECT id, country_code, city_id, gender, age_range, description, rating, date_at, created_at, updated_at
            FROM dates
            WHERE user_id = $1 AND deleted_at IS NULL AND id < $2
            ORDER BY id DESC
            LIMIT $3
            "#,
        )
        .bind(auth.user_id)
        .bind(cursor)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, (Uuid, String, i32, String, String, Option<String>, i32, NaiveDate, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)>(
            r#"
            SELECT id, country_code, city_id, gender, age_range, description, rating, date_at, created_at, updated_at
            FROM dates
            WHERE user_id = $1 AND deleted_at IS NULL
            ORDER BY id DESC
            LIMIT $2
            "#,
        )
        .bind(auth.user_id)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await?
    };

    let has_more = rows.len() as i64 > limit;
    let mut dates: Vec<DateResponse> = Vec::new();

    for row in rows.into_iter().take(limit as usize) {
        let tag_ids = fetch_tag_ids(&state.db, row.0).await?;
        dates.push(DateResponse {
            id: row.0,
            country_code: row.1,
            city_id: row.2,
            gender: row.3,
            age_range: row.4,
            description: row.5,
            rating: row.6,
            date_at: row.7,
            tag_ids,
            created_at: row.8,
            updated_at: row.9,
        });
    }

    let next_cursor = if has_more {
        dates.last().map(|d| d.id)
    } else {
        None
    };

    let resp = DateListResponse { dates, next_cursor };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": resp,
        "error": null
    })))
}

/// GET /api/dates/:id
async fn get_date(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query_as::<_, (Uuid, String, i32, String, String, Option<String>, i32, NaiveDate, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)>(
        r#"
        SELECT id, country_code, city_id, gender, age_range, description, rating, date_at, created_at, updated_at
        FROM dates
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .bind(auth.user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Date not found".to_string()))?;

    let tag_ids = fetch_tag_ids(&state.db, row.0).await?;

    let entry = DateResponse {
        id: row.0,
        country_code: row.1,
        city_id: row.2,
        gender: row.3,
        age_range: row.4,
        description: row.5,
        rating: row.6,
        date_at: row.7,
        tag_ids,
        created_at: row.8,
        updated_at: row.9,
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": entry,
        "error": null
    })))
}

/// PUT /api/dates/:id
async fn update_date(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateDateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    auth.require_nickname()?;

    // Verify ownership
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM dates WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL)",
    )
    .bind(id)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    if !exists {
        return Err(AppError::NotFound("Date not found".to_string()));
    }

    if let Some(ref cc) = body.country_code {
        if cc.len() != 2 {
            return Err(AppError::BadRequest("country_code must be ISO 3166-1 alpha-2".to_string()));
        }
        sqlx::query("UPDATE dates SET country_code = $1, updated_at = NOW() WHERE id = $2")
            .bind(cc)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(city_id) = body.city_id {
        sqlx::query("UPDATE dates SET city_id = $1, updated_at = NOW() WHERE id = $2")
            .bind(city_id)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref gender) = body.gender {
        validate_gender(gender)?;
        sqlx::query("UPDATE dates SET gender = $1, updated_at = NOW() WHERE id = $2")
            .bind(gender)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref age_range) = body.age_range {
        validate_age_range(age_range)?;
        sqlx::query("UPDATE dates SET age_range = $1, updated_at = NOW() WHERE id = $2")
            .bind(age_range)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref description) = body.description {
        sqlx::query("UPDATE dates SET description = $1, updated_at = NOW() WHERE id = $2")
            .bind(description)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(rating) = body.rating {
        validate_rating(rating)?;
        sqlx::query("UPDATE dates SET rating = $1, updated_at = NOW() WHERE id = $2")
            .bind(rating)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(date_at) = body.date_at {
        sqlx::query("UPDATE dates SET date_at = $1, updated_at = NOW() WHERE id = $2")
            .bind(date_at)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref tag_ids) = body.tag_ids {
        replace_tags(&state.db, id, tag_ids).await?;
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "id": id, "message": "Date updated" },
        "error": null
    })))
}

/// DELETE /api/dates/:id — Soft delete.
async fn delete_date(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query(
        "UPDATE dates SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Date not found".to_string()));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "id": id, "message": "Date deleted" },
        "error": null
    })))
}
