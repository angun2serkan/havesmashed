use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::AppState;

const MAX_DATES_PER_USER: i64 = 1000;
const VALID_GENDERS: &[&str] = &["male", "female", "other"];
const VALID_AGE_RANGES: &[&str] = &["18-22", "23-27", "28-32", "33-37", "38-42", "43+"];
const VALID_HEIGHT_RANGES: &[&str] = &["-150", "150-160", "160-165", "165-170", "170-175", "175-180", "180-185", "185-190", "190-195", "195-200", "200+"];

// ── Request / Response types ────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateDateRequest {
    pub country_code: String,
    pub city_id: i32,
    pub gender: String,
    pub age_range: String,
    pub height_range: Option<String>,
    pub description: Option<String>,
    pub person_nickname: Option<String>,
    pub rating: i32,
    pub face_rating: Option<i32>,
    pub body_rating: Option<i32>,
    pub chat_rating: Option<i32>,
    pub date_at: NaiveDate,
    pub tag_ids: Vec<i32>,
}

#[derive(Deserialize)]
pub struct UpdateDateRequest {
    pub country_code: Option<String>,
    pub city_id: Option<i32>,
    pub gender: Option<String>,
    pub age_range: Option<String>,
    pub height_range: Option<String>,
    pub description: Option<String>,
    pub person_nickname: Option<String>,
    pub rating: Option<i32>,
    pub face_rating: Option<i32>,
    pub body_rating: Option<i32>,
    pub chat_rating: Option<i32>,
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
    pub city_name: String,
    pub longitude: f64,
    pub latitude: f64,
    pub gender: String,
    pub age_range: String,
    pub height_range: Option<String>,
    pub description: Option<String>,
    pub person_nickname: Option<String>,
    pub rating: i32,
    pub face_rating: Option<i32>,
    pub body_rating: Option<i32>,
    pub chat_rating: Option<i32>,
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

fn validate_optional_height(height: &Option<String>) -> Result<(), AppError> {
    if let Some(ref h) = height {
        if !VALID_HEIGHT_RANGES.contains(&h.as_str()) {
            return Err(AppError::BadRequest(format!(
                "height_range must be one of: {}",
                VALID_HEIGHT_RANGES.join(", ")
            )));
        }
    }
    Ok(())
}

fn validate_rating(rating: i32) -> Result<(), AppError> {
    if !(1..=10).contains(&rating) {
        return Err(AppError::BadRequest("rating must be between 1 and 10".to_string()));
    }
    Ok(())
}

fn validate_optional_rating(rating: Option<i32>, field: &str) -> Result<(), AppError> {
    if let Some(r) = rating {
        if !(1..=10).contains(&r) {
            return Err(AppError::BadRequest(format!("{field} must be between 1 and 10")));
        }
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

/// Batch fetch tags for multiple dates in a single query (avoids N+1).
async fn fetch_tags_batch(db: &sqlx::PgPool, date_ids: &[Uuid]) -> Result<std::collections::HashMap<Uuid, Vec<i32>>, AppError> {
    use sqlx::Row;
    let mut map: std::collections::HashMap<Uuid, Vec<i32>> = std::collections::HashMap::new();
    if date_ids.is_empty() { return Ok(map); }

    let rows = sqlx::query(
        "SELECT date_id, tag_id FROM date_tags WHERE date_id = ANY($1) ORDER BY date_id, tag_id",
    )
    .bind(date_ids)
    .fetch_all(db)
    .await?;

    for row in rows {
        let did: Uuid = row.get("date_id");
        let tid: i32 = row.get("tag_id");
        map.entry(did).or_default().push(tid);
    }
    Ok(map)
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
    validate_optional_height(&body.height_range)?;
    validate_rating(body.rating)?;
    validate_optional_rating(body.face_rating, "face_rating")?;
    validate_optional_rating(body.body_rating, "body_rating")?;
    validate_optional_rating(body.chat_rating, "chat_rating")?;

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

    // Verify city exists and get name + coordinates
    let city_row = sqlx::query_as::<_, (String, f64, f64)>(
        "SELECT name, longitude, latitude FROM cities WHERE id = $1 AND country_code = $2",
    )
    .bind(body.city_id)
    .bind(&body.country_code)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("City not found for the given country".to_string()))?;

    let city_name = city_row.0;
    let longitude = city_row.1;
    let latitude = city_row.2;

    let id = Uuid::now_v7();

    sqlx::query(
        r#"
        INSERT INTO dates (id, user_id, country_code, city_id, gender, age_range, height_range, description, person_nickname, rating, face_rating, body_rating, chat_rating, date_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        "#,
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(&body.country_code)
    .bind(body.city_id)
    .bind(&body.gender)
    .bind(&body.age_range)
    .bind(&body.height_range)
    .bind(&body.description)
    .bind(&body.person_nickname)
    .bind(body.rating)
    .bind(body.face_rating)
    .bind(body.body_rating)
    .bind(body.chat_rating)
    .bind(body.date_at)
    .execute(&state.db)
    .await?;

    // Insert tags
    replace_tags(&state.db, id, &body.tag_ids).await?;

    // Check for new badges
    let new_badges = crate::handlers::badges::check_and_award_badges(&state.db, auth.user_id).await?;

    // Notify friends about new date
    let city_name_clone = city_name.clone();
    let user_nickname = auth.nickname.clone().unwrap_or_else(|| "Someone".to_string());
    let friends = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT CASE
            WHEN requester_id = $1 THEN responder_id
            ELSE requester_id
        END
        FROM connections
        WHERE (requester_id = $1 OR responder_id = $1) AND status = 'accepted'
        "#,
    )
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;

    for friend_id in friends {
        let title = format!("{} yeni bir date girdi!", user_nickname);
        let message = format!("{} - {}", city_name_clone, body.date_at);
        sqlx::query(
            "INSERT INTO notifications (user_id, title, message, notification_type) VALUES ($1, $2, $3, 'friend_date')"
        )
        .bind(friend_id)
        .bind(&title)
        .bind(&message)
        .execute(&state.db)
        .await?;
    }

    let resp = DateResponse {
        id,
        country_code: body.country_code,
        city_id: body.city_id,
        city_name,
        longitude,
        latitude,
        gender: body.gender,
        age_range: body.age_range,
        height_range: body.height_range,
        description: body.description,
        person_nickname: body.person_nickname,
        rating: body.rating,
        face_rating: body.face_rating,
        body_rating: body.body_rating,
        chat_rating: body.chat_rating,
        date_at: body.date_at,
        tag_ids: body.tag_ids,
        created_at: chrono::Utc::now(),
        updated_at: None,
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": resp,
        "new_badges": new_badges,
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
        sqlx::query(
            r#"
            SELECT d.id, d.country_code, d.city_id, c.name, c.longitude, c.latitude, d.gender, d.age_range, d.height_range, d.description, d.person_nickname, d.rating, d.face_rating, d.body_rating, d.chat_rating, d.date_at, d.created_at, d.updated_at
            FROM dates d
            JOIN cities c ON c.id = d.city_id
            WHERE d.user_id = $1 AND d.deleted_at IS NULL AND d.id < $2
            ORDER BY d.id DESC
            LIMIT $3
            "#,
        )
        .bind(auth.user_id)
        .bind(cursor)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query(
            r#"
            SELECT d.id, d.country_code, d.city_id, c.name, c.longitude, c.latitude, d.gender, d.age_range, d.height_range, d.description, d.person_nickname, d.rating, d.face_rating, d.body_rating, d.chat_rating, d.date_at, d.created_at, d.updated_at
            FROM dates d
            JOIN cities c ON c.id = d.city_id
            WHERE d.user_id = $1 AND d.deleted_at IS NULL
            ORDER BY d.id DESC
            LIMIT $2
            "#,
        )
        .bind(auth.user_id)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await?
    };

    let has_more = rows.len() as i64 > limit;
    let taken_rows: Vec<_> = rows.into_iter().take(limit as usize).collect();

    // Batch fetch all tags in one query instead of N+1
    let date_ids: Vec<Uuid> = taken_rows.iter().map(|r| r.get(0)).collect();
    let tags_map = fetch_tags_batch(&state.db, &date_ids).await?;

    let mut dates: Vec<DateResponse> = Vec::new();
    for row in taken_rows {
        let date_id: Uuid = row.get(0);
        dates.push(DateResponse {
            id: date_id,
            country_code: row.get(1),
            city_id: row.get(2),
            city_name: row.get(3),
            longitude: row.get(4),
            latitude: row.get(5),
            gender: row.get(6),
            age_range: row.get(7),
            height_range: row.get(8),
            description: row.get(9),
            person_nickname: row.get(10),
            rating: row.get(11),
            face_rating: row.get(12),
            body_rating: row.get(13),
            chat_rating: row.get(14),
            date_at: row.get(15),
            tag_ids: tags_map.get(&date_id).cloned().unwrap_or_default(),
            created_at: row.get(16),
            updated_at: row.get(17),
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
    let row = sqlx::query(
        r#"
        SELECT d.id, d.country_code, d.city_id, c.name, c.longitude, c.latitude, d.gender, d.age_range, d.height_range, d.description, d.person_nickname, d.rating, d.face_rating, d.body_rating, d.chat_rating, d.date_at, d.created_at, d.updated_at
        FROM dates d
        JOIN cities c ON c.id = d.city_id
        WHERE d.id = $1 AND d.user_id = $2 AND d.deleted_at IS NULL
        "#,
    )
    .bind(id)
    .bind(auth.user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Date not found".to_string()))?;

    let date_id: Uuid = row.get(0);
    let tag_ids = fetch_tag_ids(&state.db, date_id).await?;

    let entry = DateResponse {
        id: date_id,
        country_code: row.get(1),
        city_id: row.get(2),
        city_name: row.get(3),
        longitude: row.get(4),
        latitude: row.get(5),
        gender: row.get(6),
        age_range: row.get(7),
        height_range: row.get(8),
        description: row.get(9),
        person_nickname: row.get(10),
        rating: row.get(11),
        face_rating: row.get(12),
        body_rating: row.get(13),
        chat_rating: row.get(14),
        date_at: row.get(15),
        tag_ids,
        created_at: row.get(16),
        updated_at: row.get(17),
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

    if body.height_range.is_some() {
        validate_optional_height(&body.height_range)?;
        sqlx::query("UPDATE dates SET height_range = $1, updated_at = NOW() WHERE id = $2")
            .bind(&body.height_range)
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

    if let Some(ref person_nickname) = body.person_nickname {
        sqlx::query("UPDATE dates SET person_nickname = $1, updated_at = NOW() WHERE id = $2")
            .bind(person_nickname)
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

    if let Some(face_rating) = body.face_rating {
        validate_rating(face_rating)?;
        sqlx::query("UPDATE dates SET face_rating = $1, updated_at = NOW() WHERE id = $2")
            .bind(face_rating)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(body_rating) = body.body_rating {
        validate_rating(body_rating)?;
        sqlx::query("UPDATE dates SET body_rating = $1, updated_at = NOW() WHERE id = $2")
            .bind(body_rating)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(chat_rating) = body.chat_rating {
        validate_rating(chat_rating)?;
        sqlx::query("UPDATE dates SET chat_rating = $1, updated_at = NOW() WHERE id = $2")
            .bind(chat_rating)
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
