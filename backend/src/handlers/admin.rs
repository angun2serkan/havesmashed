use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::error::AppError;
use crate::AppState;

// ── Admin auth helper ──────────────────────────────────────────

fn verify_admin(headers: &HeaderMap, config: &crate::config::Config) -> Result<(), AppError> {
    let key = headers
        .get("x-admin-key")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing X-Admin-Key".to_string()))?;
    if key != config.admin_api_key {
        return Err(AppError::Forbidden("Invalid admin key".to_string()));
    }
    Ok(())
}

// ── Request types ──────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateCityRequest {
    pub name: String,
    pub country_code: String,
    pub latitude: f64,
    pub longitude: f64,
    pub population: Option<i32>,
}

#[derive(Deserialize)]
pub struct UpdateCityRequest {
    pub name: Option<String>,
    pub country_code: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub population: Option<i32>,
}

#[derive(Deserialize)]
pub struct BulkCreateCitiesRequest {
    pub cities: Vec<CreateCityRequest>,
}

const BULK_CITIES_MAX: usize = 1000;

#[derive(Deserialize)]
pub struct CreateBadgeRequest {
    pub name: String,
    pub description: String,
    pub icon: String,
    pub category: String,
    pub threshold: i32,
    pub image_url: Option<String>,
    pub gender: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateBadgeRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub category: Option<String>,
    pub threshold: Option<i32>,
    pub image_url: Option<String>,
    pub gender: Option<String>,
}

#[derive(Deserialize)]
pub struct ListBadgesQuery {
    pub gender: Option<String>,
}

#[derive(Deserialize)]
pub struct ListCitiesQuery {
    pub country_code: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateNotificationRequest {
    pub user_id: Option<Uuid>,
    pub title: String,
    pub message: String,
    pub notification_type: Option<String>,
}

#[derive(Deserialize)]
pub struct ReviewReportRequest {
    pub status: String, // "reviewed" or "dismissed"
}

#[derive(Deserialize)]
pub struct BanUserRequest {
    pub duration_hours: i32, // 24, 72, 168 (7d), 720 (30d), 0 = permanent
    pub reason: Option<String>,
}

// ── Router ─────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        // Dashboard
        .route("/metrics", get(get_metrics))
        // Cities
        .route("/cities", get(list_cities))
        .route("/cities", post(create_city))
        .route("/cities/bulk", post(bulk_create_cities))
        .route("/cities/{id}", put(update_city))
        .route("/cities/{id}", delete(delete_city))
        // Badges
        .route("/badges/upload", post(upload_badge_image))
        .route("/badges", get(list_badges).post(create_badge))
        .route("/badges/{id}", put(update_badge).delete(delete_badge))
        // Notifications
        .route("/notifications", post(send_notification))
        .route("/notifications", get(list_notifications))
        // Users
        .route("/users", get(list_users))
        .route("/users/{id}", get(get_user))
        // Invites
        .route("/invites", post(create_platform_invite))
        // Forum
        .route("/forum/topics", get(list_forum_topics_admin))
        .route("/forum/topics/{id}", delete(delete_forum_topic_admin))
        .route("/forum/topics/{id}/pin", put(toggle_pin))
        .route("/forum/topics/{id}/lock", put(toggle_lock))
        .route("/forum/comments/{id}", delete(delete_forum_comment_admin))
        // Forum moderation
        .route("/forum/reports", get(list_reports))
        .route("/forum/reports/{id}/review", put(review_report))
        .route("/forum/users/{id}/ban", post(ban_user))
        .route("/forum/users/{id}/unban", post(unban_user))
        .route("/forum/bans", get(list_active_bans))
}

// ── Dashboard ──────────────────────────────────────────────────

/// GET /api/admin/metrics
async fn get_metrics(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    let total_users = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM users WHERE is_active = TRUE",
    )
    .fetch_one(&state.db)
    .await?;

    let total_dates = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM dates WHERE deleted_at IS NULL",
    )
    .fetch_one(&state.db)
    .await?;

    let daily_active_users = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM users WHERE last_seen_at >= NOW() - INTERVAL '24 hours' AND is_active = TRUE",
    )
    .fetch_one(&state.db)
    .await?;

    let total_connections = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM connections WHERE status = 'accepted'",
    )
    .fetch_one(&state.db)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "total_users": total_users,
            "total_dates": total_dates,
            "daily_active_users": daily_active_users,
            "total_connections": total_connections,
        },
        "error": null
    })))
}

// ── City management ────────────────────────────────────────────

/// GET /api/admin/cities
async fn list_cities(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<ListCitiesQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    use sqlx::Row;
    let rows = if let Some(ref country_code) = params.country_code {
        sqlx::query(
            r#"
            SELECT id, name, country_code, longitude, latitude, population
            FROM cities
            WHERE country_code = $1
            ORDER BY country_code, population DESC NULLS LAST, name
            "#,
        )
        .bind(country_code)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query(
            r#"
            SELECT id, name, country_code, longitude, latitude, population
            FROM cities
            ORDER BY country_code, population DESC NULLS LAST, name
            "#,
        )
        .fetch_all(&state.db)
        .await?
    };

    let cities: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<i32, _>("id"),
                "name": r.get::<String, _>("name"),
                "country_code": r.get::<String, _>("country_code"),
                "longitude": r.get::<f64, _>("longitude"),
                "latitude": r.get::<f64, _>("latitude"),
                "population": r.get::<Option<i32>, _>("population"),
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": cities, "error": null })))
}

/// POST /api/admin/cities
async fn create_city(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateCityRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    let id = sqlx::query_scalar::<_, i32>(
        "INSERT INTO cities (name, country_code, longitude, latitude, population) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    )
    .bind(&body.name)
    .bind(&body.country_code)
    .bind(body.longitude)
    .bind(body.latitude)
    .bind(body.population)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": id,
            "name": body.name,
            "country_code": body.country_code,
            "latitude": body.latitude,
            "longitude": body.longitude,
            "population": body.population,
        },
        "error": null
    })))
}

/// POST /api/admin/cities/bulk
/// Body: { "cities": [ { name, country_code, latitude, longitude, population? }, ... ] }
/// Returns: { added, skipped, errors: [{ row, name, reason }] }
/// - Duplicates (same name+country_code) are silently skipped (counted as `skipped`)
/// - Invalid rows are reported in `errors` and not inserted
/// - Valid rows are inserted in a single transaction
async fn bulk_create_cities(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<BulkCreateCitiesRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    if body.cities.is_empty() {
        return Err(AppError::BadRequest("cities array is empty".into()));
    }
    if body.cities.len() > BULK_CITIES_MAX {
        return Err(AppError::BadRequest(format!(
            "too many cities (max {})",
            BULK_CITIES_MAX
        )));
    }

    let mut errors: Vec<serde_json::Value> = Vec::new();
    let mut valid: Vec<CreateCityRequest> = Vec::new();

    for (i, city) in body.cities.into_iter().enumerate() {
        let name = city.name.trim().to_string();
        let cc = city.country_code.trim().to_uppercase();

        let push_err = |errors: &mut Vec<serde_json::Value>, reason: String| {
            errors.push(json!({
                "row": i,
                "name": if name.is_empty() { serde_json::Value::Null } else { json!(name) },
                "reason": reason,
            }));
        };

        if name.is_empty() {
            push_err(&mut errors, "name is empty".into());
            continue;
        }
        if cc.len() != 2 || !cc.chars().all(|c| c.is_ascii_alphabetic()) {
            push_err(&mut errors, format!("invalid country_code: {:?}", city.country_code));
            continue;
        }
        if !(-90.0..=90.0).contains(&city.latitude) {
            push_err(&mut errors, format!("invalid latitude: {}", city.latitude));
            continue;
        }
        if !(-180.0..=180.0).contains(&city.longitude) {
            push_err(&mut errors, format!("invalid longitude: {}", city.longitude));
            continue;
        }
        if let Some(p) = city.population {
            if p < 0 {
                push_err(&mut errors, format!("invalid population: {}", p));
                continue;
            }
        }

        valid.push(CreateCityRequest {
            name,
            country_code: cc,
            latitude: city.latitude,
            longitude: city.longitude,
            population: city.population,
        });
    }

    let mut added = 0u32;
    let mut skipped = 0u32;

    if !valid.is_empty() {
        let mut tx = state.db.begin().await?;
        for c in &valid {
            let inserted: Option<i32> = sqlx::query_scalar(
                "INSERT INTO cities (name, country_code, longitude, latitude, population) \
                 VALUES ($1, $2, $3, $4, $5) \
                 ON CONFLICT (name, country_code) DO NOTHING \
                 RETURNING id",
            )
            .bind(&c.name)
            .bind(&c.country_code)
            .bind(c.longitude)
            .bind(c.latitude)
            .bind(c.population)
            .fetch_optional(&mut *tx)
            .await?;

            if inserted.is_some() {
                added += 1;
            } else {
                skipped += 1;
            }
        }
        tx.commit().await?;
    }

    Ok(Json(json!({
        "success": true,
        "data": {
            "added": added,
            "skipped": skipped,
            "errors": errors,
        },
        "error": null
    })))
}

/// PUT /api/admin/cities/:id
async fn update_city(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<UpdateCityRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    // Verify city exists
    let exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM cities WHERE id = $1)")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    if !exists {
        return Err(AppError::NotFound("City not found".to_string()));
    }

    if let Some(ref name) = body.name {
        sqlx::query("UPDATE cities SET name = $1 WHERE id = $2")
            .bind(name)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref country_code) = body.country_code {
        sqlx::query("UPDATE cities SET country_code = $1 WHERE id = $2")
            .bind(country_code)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let (Some(lat), Some(lng)) = (body.latitude, body.longitude) {
        sqlx::query("UPDATE cities SET longitude = $1, latitude = $2 WHERE id = $3")
            .bind(lng)
            .bind(lat)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(pop) = body.population {
        sqlx::query("UPDATE cities SET population = $1 WHERE id = $2")
            .bind(pop)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    Ok(Json(json!({ "success": true, "data": { "id": id, "message": "City updated" }, "error": null })))
}

/// DELETE /api/admin/cities/:id
async fn delete_city(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    // Check if any dates reference this city
    let date_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM dates WHERE city_id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    if date_count > 0 {
        return Err(AppError::Conflict(format!(
            "Cannot delete city: {} dates reference it",
            date_count
        )));
    }

    let result = sqlx::query("DELETE FROM cities WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("City not found".to_string()));
    }

    Ok(Json(json!({ "success": true, "data": { "id": id, "message": "City deleted" }, "error": null })))
}

// ── Badge management ───────────────────────────────────────────

/// GET /api/admin/badges
async fn list_badges(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<ListBadgesQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    use sqlx::Row;
    let rows = if let Some(ref gender) = params.gender {
        sqlx::query(
            "SELECT id, name, description, icon, category, threshold, image_url, gender FROM badges WHERE gender = $1 OR gender = 'both' ORDER BY id",
        )
        .bind(gender)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query(
            "SELECT id, name, description, icon, category, threshold, image_url, gender FROM badges ORDER BY id",
        )
        .fetch_all(&state.db)
        .await?
    };

    let badges: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<i32, _>("id"),
                "name": r.get::<String, _>("name"),
                "description": r.get::<String, _>("description"),
                "icon": r.get::<String, _>("icon"),
                "category": r.get::<String, _>("category"),
                "threshold": r.get::<i32, _>("threshold"),
                "image_url": r.get::<Option<String>, _>("image_url"),
                "gender": r.get::<Option<String>, _>("gender"),
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": badges, "error": null })))
}

/// POST /api/admin/badges
async fn create_badge(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateBadgeRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    let gender = body.gender.as_deref().unwrap_or("both");

    let id = sqlx::query_scalar::<_, i32>(
        "INSERT INTO badges (name, description, icon, category, threshold, image_url, gender) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    )
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.icon)
    .bind(&body.category)
    .bind(body.threshold)
    .bind(&body.image_url)
    .bind(gender)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": id,
            "name": body.name,
            "description": body.description,
            "icon": body.icon,
            "category": body.category,
            "threshold": body.threshold,
            "image_url": body.image_url,
            "gender": gender,
        },
        "error": null
    })))
}

/// PUT /api/admin/badges/:id
async fn update_badge(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<UpdateBadgeRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    let exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM badges WHERE id = $1)")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    if !exists {
        return Err(AppError::NotFound("Badge not found".to_string()));
    }

    if let Some(ref name) = body.name {
        sqlx::query("UPDATE badges SET name = $1 WHERE id = $2")
            .bind(name)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref description) = body.description {
        sqlx::query("UPDATE badges SET description = $1 WHERE id = $2")
            .bind(description)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref icon) = body.icon {
        sqlx::query("UPDATE badges SET icon = $1 WHERE id = $2")
            .bind(icon)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref category) = body.category {
        sqlx::query("UPDATE badges SET category = $1 WHERE id = $2")
            .bind(category)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(threshold) = body.threshold {
        sqlx::query("UPDATE badges SET threshold = $1 WHERE id = $2")
            .bind(threshold)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref image_url) = body.image_url {
        sqlx::query("UPDATE badges SET image_url = $1 WHERE id = $2")
            .bind(image_url)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref gender) = body.gender {
        sqlx::query("UPDATE badges SET gender = $1 WHERE id = $2")
            .bind(gender)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    Ok(Json(json!({ "success": true, "data": { "id": id, "message": "Badge updated" }, "error": null })))
}

/// POST /api/admin/badges/upload
/// Upload a badge image. Returns the file path.
async fn upload_badge_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {e}")))?
    {
        let filename = field
            .file_name()
            .map(|f| f.to_string())
            .unwrap_or_else(|| format!("{}.png", uuid::Uuid::new_v4()));

        // Sanitize filename
        let safe_name = format!(
            "{}_{}",
            chrono::Utc::now().timestamp_millis(),
            filename.replace(
                |c: char| !c.is_alphanumeric() && c != '.' && c != '-' && c != '_',
                "_"
            )
        );

        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(format!("Read error: {e}")))?;

        // Ensure directory exists
        tokio::fs::create_dir_all("uploads/badges")
            .await
            .map_err(|e| AppError::Internal(format!("Dir create error: {e}")))?;

        let path = format!("uploads/badges/{safe_name}");
        tokio::fs::write(&path, &data)
            .await
            .map_err(|e| AppError::Internal(format!("Write error: {e}")))?;

        let url = format!("/uploads/badges/{safe_name}");

        return Ok(Json(json!({
            "success": true,
            "data": { "url": url, "filename": safe_name },
            "error": null
        })));
    }

    Err(AppError::BadRequest("No file provided".to_string()))
}

/// DELETE /api/admin/badges/:id
async fn delete_badge(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    // Check if any users have earned this badge
    let earned_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM user_badges WHERE badge_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    if earned_count > 0 {
        return Err(AppError::Conflict(format!(
            "Cannot delete badge: {} users have earned it",
            earned_count
        )));
    }

    let result = sqlx::query("DELETE FROM badges WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Badge not found".to_string()));
    }

    Ok(Json(json!({ "success": true, "data": { "id": id, "message": "Badge deleted" }, "error": null })))
}

// ── Notification management ────────────────────────────────────

/// POST /api/admin/notifications
async fn send_notification(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateNotificationRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    use sqlx::Row;
    let notification_type = body.notification_type.as_deref().unwrap_or("system");

    let row = sqlx::query(
        "INSERT INTO notifications (user_id, title, message, notification_type) VALUES ($1, $2, $3, $4) RETURNING id, created_at",
    )
    .bind(body.user_id)
    .bind(&body.title)
    .bind(&body.message)
    .bind(notification_type)
    .fetch_one(&state.db)
    .await?;

    let id: Uuid = row.get("id");
    let created_at: chrono::DateTime<chrono::Utc> = row.get("created_at");

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": id,
            "user_id": body.user_id,
            "title": body.title,
            "message": body.message,
            "notification_type": notification_type,
            "is_broadcast": body.user_id.is_none(),
            "created_at": created_at,
        },
        "error": null
    })))
}

/// GET /api/admin/notifications
async fn list_notifications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    use sqlx::Row;
    let rows = sqlx::query(
        r#"
        SELECT n.id, n.user_id, n.title, n.message, n.is_read, n.created_at,
               n.notification_type, u.nickname AS user_nickname
        FROM notifications n
        LEFT JOIN users u ON u.id = n.user_id
        ORDER BY n.created_at DESC
        LIMIT 100
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    let notifications: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<Uuid, _>("id"),
                "user_id": r.get::<Option<Uuid>, _>("user_id"),
                "title": r.get::<String, _>("title"),
                "message": r.get::<String, _>("message"),
                "is_read": r.get::<bool, _>("is_read"),
                "notification_type": r.get::<String, _>("notification_type"),
                "is_broadcast": r.get::<Option<Uuid>, _>("user_id").is_none(),
                "user_nickname": r.get::<Option<String>, _>("user_nickname"),
                "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": notifications, "error": null })))
}

// ── User management ───────────────────────────────────────────

/// GET /api/admin/users
async fn list_users(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    use sqlx::Row;
    let rows = sqlx::query(
        r#"
        SELECT u.id, u.nickname, u.is_active, u.created_at, u.last_seen_at,
               (SELECT COUNT(*) FROM dates WHERE user_id = u.id AND deleted_at IS NULL) AS date_count,
               (SELECT COUNT(*) FROM connections WHERE (requester_id = u.id OR responder_id = u.id) AND status = 'accepted') AS friend_count
        FROM users u
        ORDER BY u.created_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    let users: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<Uuid, _>("id"),
                "nickname": r.get::<Option<String>, _>("nickname"),
                "is_active": r.get::<bool, _>("is_active"),
                "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                "last_seen_at": r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("last_seen_at"),
                "date_count": r.get::<i64, _>("date_count"),
                "friend_count": r.get::<i64, _>("friend_count"),
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": users, "error": null })))
}

/// GET /api/admin/users/:id
async fn get_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    use sqlx::Row;
    let row = sqlx::query(
        r#"
        SELECT u.id, u.nickname, u.is_active, u.created_at, u.last_seen_at, u.invite_count,
               (SELECT COUNT(*) FROM dates WHERE user_id = u.id AND deleted_at IS NULL) AS date_count,
               (SELECT COUNT(*) FROM connections WHERE (requester_id = u.id OR responder_id = u.id) AND status = 'accepted') AS friend_count,
               (SELECT COUNT(DISTINCT country_code) FROM dates WHERE user_id = u.id AND deleted_at IS NULL) AS country_count,
               (SELECT COUNT(DISTINCT city_id) FROM dates WHERE user_id = u.id AND deleted_at IS NULL) AS city_count
        FROM users u
        WHERE u.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    let row = row.ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    // Get user's badges
    let badges = sqlx::query(
        r#"
        SELECT b.id, b.name, b.icon, ub.earned_at
        FROM user_badges ub
        JOIN badges b ON b.id = ub.badge_id
        WHERE ub.user_id = $1
        ORDER BY ub.earned_at DESC
        "#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    let badge_list: Vec<serde_json::Value> = badges
        .iter()
        .map(|b| {
            json!({
                "id": b.get::<i32, _>("id"),
                "name": b.get::<String, _>("name"),
                "icon": b.get::<String, _>("icon"),
                "earned_at": b.get::<chrono::DateTime<chrono::Utc>, _>("earned_at"),
            })
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": row.get::<Uuid, _>("id"),
            "nickname": row.get::<Option<String>, _>("nickname"),
            "is_active": row.get::<bool, _>("is_active"),
            "created_at": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
            "last_seen_at": row.get::<Option<chrono::DateTime<chrono::Utc>>, _>("last_seen_at"),
            "invite_count": row.get::<i32, _>("invite_count"),
            "date_count": row.get::<i64, _>("date_count"),
            "friend_count": row.get::<i64, _>("friend_count"),
            "country_count": row.get::<i64, _>("country_count"),
            "city_count": row.get::<i64, _>("city_count"),
            "badges": badge_list,
        },
        "error": null
    })))
}

// ── Invite management ─────────────────────────────────────────

/// POST /api/admin/invites
/// Create a platform invite link (admin-generated, no user auth needed).
async fn create_platform_invite(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    use crate::services::invite::{self, InviteData, InviteType};

    let token = invite::generate_token();
    let data = InviteData {
        inviter_id: Uuid::nil(), // admin-generated, no specific user
        created_at: chrono::Utc::now().to_rfc3339(),
        invite_type: InviteType::Platform,
    };

    let mut redis = state.redis.clone();
    invite::store_invite(&mut redis, &token, &data).await?;

    let base_url = std::env::var("FRONTEND_URL")
        .unwrap_or_else(|_| "http://localhost:5173".to_string());
    let link = format!("{base_url}/invite/{token}");

    Ok(Json(json!({
        "success": true,
        "data": {
            "token": token,
            "link": link,
            "expires_in_secs": 86400
        },
        "error": null
    })))
}

// ── Forum management ──────────────────────────────────────────

/// GET /api/admin/forum/topics
async fn list_forum_topics_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    use sqlx::Row;
    let rows = sqlx::query(
        r#"
        SELECT t.id, t.user_id, t.title, t.body, t.category, t.is_anonymous,
               t.is_pinned, t.is_locked, t.like_count, t.comment_count,
               t.created_at, t.updated_at, t.deleted_at,
               u.nickname AS author_nickname
        FROM forum_topics t
        JOIN users u ON u.id = t.user_id
        ORDER BY t.created_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    let topics: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<Uuid, _>("id"),
                "user_id": r.get::<Uuid, _>("user_id"),
                "title": r.get::<String, _>("title"),
                "body": r.get::<String, _>("body"),
                "category": r.get::<String, _>("category"),
                "is_anonymous": r.get::<bool, _>("is_anonymous"),
                "is_pinned": r.get::<bool, _>("is_pinned"),
                "is_locked": r.get::<bool, _>("is_locked"),
                "like_count": r.get::<i32, _>("like_count"),
                "comment_count": r.get::<i32, _>("comment_count"),
                "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                "updated_at": r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("updated_at"),
                "deleted_at": r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("deleted_at"),
                "author_nickname": r.get::<Option<String>, _>("author_nickname"),
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": topics, "error": null })))
}

/// DELETE /api/admin/forum/topics/:id (hard delete)
async fn delete_forum_topic_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    let result = sqlx::query("DELETE FROM forum_topics WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Topic not found".to_string()));
    }

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "message": "Topic hard deleted" },
        "error": null
    })))
}

/// PUT /api/admin/forum/topics/:id/pin
async fn toggle_pin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    use sqlx::Row;
    let row = sqlx::query(
        "UPDATE forum_topics SET is_pinned = NOT is_pinned WHERE id = $1 RETURNING is_pinned",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Topic not found".to_string()))?;

    let is_pinned: bool = row.get("is_pinned");

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "is_pinned": is_pinned },
        "error": null
    })))
}

/// PUT /api/admin/forum/topics/:id/lock
async fn toggle_lock(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    use sqlx::Row;
    let row = sqlx::query(
        "UPDATE forum_topics SET is_locked = NOT is_locked WHERE id = $1 RETURNING is_locked",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Topic not found".to_string()))?;

    let is_locked: bool = row.get("is_locked");

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "is_locked": is_locked },
        "error": null
    })))
}

/// DELETE /api/admin/forum/comments/:id (hard delete)
async fn delete_forum_comment_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    let result = sqlx::query("DELETE FROM forum_comments WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Comment not found".to_string()));
    }

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "message": "Comment hard deleted" },
        "error": null
    })))
}

// ── Forum moderation ──────────────────────────────────────────

/// GET /api/admin/forum/reports
async fn list_reports(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    use sqlx::Row;
    let rows = sqlx::query(
        r#"
        SELECT r.id, r.reporter_id, u.nickname AS reporter_nickname,
               r.target_type, r.target_id, r.reason, r.description,
               r.status, r.reviewed_by, r.reviewed_at, r.created_at,
               (SELECT COUNT(*) FROM forum_reports r2 WHERE r2.target_type = r.target_type AND r2.target_id = r.target_id) AS total_reports_on_target,
               CASE
                   WHEN r.target_type = 'topic' THEN (SELECT t.user_id FROM forum_topics t WHERE t.id = r.target_id)
                   WHEN r.target_type = 'comment' THEN (SELECT c.user_id FROM forum_comments c WHERE c.id = r.target_id)
               END AS reported_user_id,
               CASE
                   WHEN r.target_type = 'topic' THEN (SELECT u2.nickname FROM forum_topics t JOIN users u2 ON u2.id = t.user_id WHERE t.id = r.target_id)
                   WHEN r.target_type = 'comment' THEN (SELECT u2.nickname FROM forum_comments c JOIN users u2 ON u2.id = c.user_id WHERE c.id = r.target_id)
               END AS reported_user_nickname,
               CASE
                   WHEN r.target_type = 'topic' THEN (
                       SELECT COUNT(*) FROM forum_reports r3
                       JOIN forum_topics t2 ON t2.id = r3.target_id AND r3.target_type = 'topic'
                       WHERE t2.user_id = (SELECT t3.user_id FROM forum_topics t3 WHERE t3.id = r.target_id)
                   ) + (
                       SELECT COUNT(*) FROM forum_reports r3
                       JOIN forum_comments c2 ON c2.id = r3.target_id AND r3.target_type = 'comment'
                       WHERE c2.user_id = (SELECT t3.user_id FROM forum_topics t3 WHERE t3.id = r.target_id)
                   )
                   WHEN r.target_type = 'comment' THEN (
                       SELECT COUNT(*) FROM forum_reports r3
                       JOIN forum_topics t2 ON t2.id = r3.target_id AND r3.target_type = 'topic'
                       WHERE t2.user_id = (SELECT c3.user_id FROM forum_comments c3 WHERE c3.id = r.target_id)
                   ) + (
                       SELECT COUNT(*) FROM forum_reports r3
                       JOIN forum_comments c2 ON c2.id = r3.target_id AND r3.target_type = 'comment'
                       WHERE c2.user_id = (SELECT c3.user_id FROM forum_comments c3 WHERE c3.id = r.target_id)
                   )
               END AS reported_user_total_reports
        FROM forum_reports r
        JOIN users u ON u.id = r.reporter_id
        ORDER BY r.status = 'pending' DESC, r.created_at DESC
        LIMIT 100
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    let reports: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<Uuid, _>("id"),
                "reporter_id": r.get::<Uuid, _>("reporter_id"),
                "reporter_nickname": r.get::<Option<String>, _>("reporter_nickname"),
                "target_type": r.get::<String, _>("target_type"),
                "target_id": r.get::<Uuid, _>("target_id"),
                "reason": r.get::<String, _>("reason"),
                "description": r.get::<Option<String>, _>("description"),
                "status": r.get::<String, _>("status"),
                "reviewed_by": r.get::<Option<String>, _>("reviewed_by"),
                "reviewed_at": r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("reviewed_at"),
                "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                "total_reports_on_target": r.get::<i64, _>("total_reports_on_target"),
                "reported_user_id": r.get::<Option<Uuid>, _>("reported_user_id"),
                "reported_user_nickname": r.get::<Option<String>, _>("reported_user_nickname"),
                "reported_user_total_reports": r.get::<Option<i64>, _>("reported_user_total_reports"),
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": reports, "error": null })))
}

/// PUT /api/admin/forum/reports/:id/review
async fn review_report(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<ReviewReportRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    if !["reviewed", "dismissed"].contains(&body.status.as_str()) {
        return Err(AppError::BadRequest("Status must be 'reviewed' or 'dismissed'".into()));
    }

    let result = sqlx::query(
        "UPDATE forum_reports SET status = $1, reviewed_at = NOW(), reviewed_by = 'admin' WHERE id = $2"
    )
    .bind(&body.status)
    .bind(id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Report not found".to_string()));
    }

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "status": body.status, "message": "Report updated" },
        "error": null
    })))
}

/// POST /api/admin/forum/users/:id/ban
async fn ban_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
    Json(body): Json<BanUserRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    let expires_at = if body.duration_hours == 0 {
        // Permanent: set to year 2099
        Some(chrono::DateTime::parse_from_rfc3339("2099-01-01T00:00:00Z").unwrap().with_timezone(&chrono::Utc))
    } else {
        Some(chrono::Utc::now() + chrono::Duration::hours(body.duration_hours as i64))
    };

    // Update user
    let result = sqlx::query("UPDATE users SET forum_banned_until = $1 WHERE id = $2")
        .bind(expires_at)
        .bind(user_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("User not found".to_string()));
    }

    // Record in ban history
    sqlx::query(
        "INSERT INTO forum_ban_history (user_id, banned_by, duration_hours, reason, expires_at) VALUES ($1, 'admin', $2, $3, $4)"
    )
    .bind(user_id)
    .bind(body.duration_hours)
    .bind(&body.reason)
    .bind(expires_at)
    .execute(&state.db)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "user_id": user_id,
            "banned_until": expires_at,
            "duration_hours": body.duration_hours,
            "message": "User banned from forum"
        },
        "error": null
    })))
}

/// POST /api/admin/forum/users/:id/unban
async fn unban_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    let result = sqlx::query("UPDATE users SET forum_banned_until = NULL WHERE id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("User not found".to_string()));
    }

    Ok(Json(json!({
        "success": true,
        "data": { "user_id": user_id, "message": "User unbanned from forum" },
        "error": null
    })))
}

/// GET /api/admin/forum/bans
async fn list_active_bans(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_admin(&headers, &state.config)?;

    use sqlx::Row;
    let rows = sqlx::query(
        r#"
        SELECT u.id, u.nickname, u.forum_banned_until,
               (SELECT COUNT(*) FROM forum_reports r JOIN forum_topics t ON t.id = r.target_id AND r.target_type = 'topic' WHERE t.user_id = u.id) +
               (SELECT COUNT(*) FROM forum_reports r JOIN forum_comments c ON c.id = r.target_id AND r.target_type = 'comment' WHERE c.user_id = u.id) AS total_reports
        FROM users u
        WHERE u.forum_banned_until IS NOT NULL AND u.forum_banned_until > NOW()
        ORDER BY u.forum_banned_until DESC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    let bans: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<Uuid, _>("id"),
                "nickname": r.get::<Option<String>, _>("nickname"),
                "forum_banned_until": r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("forum_banned_until"),
                "total_reports": r.get::<i64, _>("total_reports"),
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": bans, "error": null })))
}
