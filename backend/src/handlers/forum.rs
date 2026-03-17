use axum::extract::{Path, Query, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::AppState;

const VALID_CATEGORIES: &[&str] = &["general", "tips", "stories", "questions", "off-topic"];

// ── Request types ──────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListTopicsQuery {
    pub category: Option<String>,
    pub sort: Option<String>,
    pub cursor: Option<Uuid>,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct CreateTopicRequest {
    pub title: String,
    pub body: String,
    pub category: String,
    pub is_anonymous: Option<bool>,
}

#[derive(Deserialize)]
pub struct UpdateTopicRequest {
    pub title: Option<String>,
    pub body: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateCommentRequest {
    pub body: String,
    pub parent_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct UpdateCommentRequest {
    pub body: String,
}

#[derive(Deserialize)]
pub struct ToggleLikeRequest {
    pub target_type: String,
    pub target_id: Uuid,
}

// ── Router ─────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/topics", get(list_topics).post(create_topic))
        .route("/topics/{id}", get(get_topic).put(update_topic).delete(delete_topic))
        .route("/topics/{id}/comments", post(create_comment))
        .route("/comments/{id}", put(update_comment).delete(delete_comment))
        .route("/like", post(toggle_like))
}

// ── Handlers ───────────────────────────────────────────────────

/// GET /api/forum/topics
async fn list_topics(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<ListTopicsQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let limit = params.limit.unwrap_or(20).min(50);
    let sort = params.sort.as_deref().unwrap_or("hot");

    let order_clause = match sort {
        "new" => "t.created_at DESC",
        "top" => "t.like_count DESC, t.created_at DESC",
        _ => "(t.like_count + t.comment_count) DESC, t.created_at DESC", // hot
    };

    // Build dynamic query
    let mut sql = String::from(
        r#"
        SELECT t.id, t.title, t.body, t.category, t.is_anonymous, t.is_pinned,
               t.is_locked, t.like_count, t.comment_count, t.created_at,
               u.nickname AS author_nickname,
               CASE WHEN fl.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS liked,
               (SELECT b.icon FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = t.user_id ORDER BY b.id DESC LIMIT 1) AS top_badge_icon
        FROM forum_topics t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN forum_likes fl ON fl.target_type = 'topic' AND fl.target_id = t.id AND fl.user_id = $1
        WHERE t.deleted_at IS NULL
        "#,
    );

    let mut param_idx = 2;

    if let Some(ref category) = params.category {
        if !VALID_CATEGORIES.contains(&category.as_str()) {
            return Err(AppError::BadRequest("Invalid category".to_string()));
        }
        sql.push_str(&format!(" AND t.category = ${param_idx}"));
        param_idx += 1;
    }

    if params.cursor.is_some() {
        sql.push_str(&format!(" AND t.id < ${param_idx}"));
        param_idx += 1;
    }

    sql.push_str(&format!(
        " ORDER BY t.is_pinned DESC, {order_clause} LIMIT ${param_idx}"
    ));

    // We need to bind dynamically based on which params are present
    let mut query = sqlx::query(&sql).bind(auth.user_id);

    if let Some(ref category) = params.category {
        query = query.bind(category);
    }

    if let Some(cursor) = params.cursor {
        query = query.bind(cursor);
    }

    query = query.bind(limit + 1);

    let rows = query.fetch_all(&state.db).await?;

    let has_more = rows.len() as i64 > limit;
    let taken_rows: Vec<_> = rows.into_iter().take(limit as usize).collect();

    let topics: Vec<serde_json::Value> = taken_rows
        .iter()
        .map(|r| {
            let body_full: String = r.get("body");
            let body_preview = if body_full.len() > 200 {
                format!("{}...", &body_full[..body_full.floor_char_boundary(200)])
            } else {
                body_full
            };

            let is_anonymous: bool = r.get("is_anonymous");
            let author_nickname: Option<String> = if is_anonymous {
                None
            } else {
                r.get("author_nickname")
            };
            let top_badge_icon: Option<String> = if is_anonymous {
                None
            } else {
                r.get("top_badge_icon")
            };

            json!({
                "id": r.get::<Uuid, _>("id"),
                "title": r.get::<String, _>("title"),
                "body_preview": body_preview,
                "category": r.get::<String, _>("category"),
                "is_anonymous": is_anonymous,
                "is_pinned": r.get::<bool, _>("is_pinned"),
                "is_locked": r.get::<bool, _>("is_locked"),
                "like_count": r.get::<i32, _>("like_count"),
                "comment_count": r.get::<i32, _>("comment_count"),
                "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                "author_nickname": author_nickname,
                "top_badge_icon": top_badge_icon,
                "liked": r.get::<bool, _>("liked"),
            })
        })
        .collect();

    let next_cursor = if has_more {
        taken_rows.last().map(|r| r.get::<Uuid, _>("id"))
    } else {
        None
    };

    Ok(Json(json!({
        "success": true,
        "data": {
            "topics": topics,
            "next_cursor": next_cursor,
        },
        "error": null
    })))
}

/// POST /api/forum/topics
async fn create_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateTopicRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    auth.require_nickname()?;

    // Validate title
    if body.title.is_empty() || body.title.len() > 200 {
        return Err(AppError::BadRequest(
            "Title must be between 1 and 200 characters".to_string(),
        ));
    }

    // Validate body
    if body.body.is_empty() || body.body.len() > 5000 {
        return Err(AppError::BadRequest(
            "Body must be between 1 and 5000 characters".to_string(),
        ));
    }

    // Validate category
    if !VALID_CATEGORIES.contains(&body.category.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Category must be one of: {}",
            VALID_CATEGORIES.join(", ")
        )));
    }

    let is_anonymous = body.is_anonymous.unwrap_or(false);

    let row = sqlx::query(
        r#"
        INSERT INTO forum_topics (user_id, title, body, category, is_anonymous)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at
        "#,
    )
    .bind(auth.user_id)
    .bind(&body.title)
    .bind(&body.body)
    .bind(&body.category)
    .bind(is_anonymous)
    .fetch_one(&state.db)
    .await?;

    let id: Uuid = row.get("id");
    let created_at: chrono::DateTime<chrono::Utc> = row.get("created_at");

    let author_nickname = if is_anonymous {
        None
    } else {
        auth.nickname.clone()
    };

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": id,
            "title": body.title,
            "body": body.body,
            "category": body.category,
            "is_anonymous": is_anonymous,
            "is_pinned": false,
            "is_locked": false,
            "like_count": 0,
            "comment_count": 0,
            "created_at": created_at,
            "author_nickname": author_nickname,
        },
        "error": null
    })))
}

/// GET /api/forum/topics/:id
async fn get_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Fetch topic
    let topic_row = sqlx::query(
        r#"
        SELECT t.id, t.user_id, t.title, t.body, t.category, t.is_anonymous,
               t.is_pinned, t.is_locked, t.like_count, t.comment_count,
               t.created_at, t.updated_at,
               u.nickname AS author_nickname,
               CASE WHEN fl.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS liked,
               (SELECT b.icon FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = t.user_id ORDER BY b.id DESC LIMIT 1) AS top_badge_icon
        FROM forum_topics t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN forum_likes fl ON fl.target_type = 'topic' AND fl.target_id = t.id AND fl.user_id = $2
        WHERE t.id = $1 AND t.deleted_at IS NULL
        "#,
    )
    .bind(id)
    .bind(auth.user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Topic not found".to_string()))?;

    let is_anonymous: bool = topic_row.get("is_anonymous");
    let author_nickname: Option<String> = if is_anonymous {
        None
    } else {
        topic_row.get("author_nickname")
    };
    let topic_top_badge_icon: Option<String> = if is_anonymous {
        None
    } else {
        topic_row.get("top_badge_icon")
    };

    let topic = json!({
        "id": topic_row.get::<Uuid, _>("id"),
        "user_id": topic_row.get::<Uuid, _>("user_id"),
        "title": topic_row.get::<String, _>("title"),
        "body": topic_row.get::<String, _>("body"),
        "category": topic_row.get::<String, _>("category"),
        "is_anonymous": is_anonymous,
        "is_pinned": topic_row.get::<bool, _>("is_pinned"),
        "is_locked": topic_row.get::<bool, _>("is_locked"),
        "like_count": topic_row.get::<i32, _>("like_count"),
        "comment_count": topic_row.get::<i32, _>("comment_count"),
        "created_at": topic_row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
        "updated_at": topic_row.get::<Option<chrono::DateTime<chrono::Utc>>, _>("updated_at"),
        "author_nickname": author_nickname,
        "top_badge_icon": topic_top_badge_icon,
        "liked": topic_row.get::<bool, _>("liked"),
    });

    // Fetch comments
    let comment_rows = sqlx::query(
        r#"
        SELECT c.id, c.parent_id, c.depth, c.body, c.like_count,
               c.created_at, c.updated_at, c.user_id,
               u.nickname,
               CASE WHEN fl.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS liked,
               (SELECT b.icon FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = c.user_id ORDER BY b.id DESC LIMIT 1) AS top_badge_icon
        FROM forum_comments c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN forum_likes fl ON fl.target_type = 'comment' AND fl.target_id = c.id AND fl.user_id = $2
        WHERE c.topic_id = $1 AND c.deleted_at IS NULL
        ORDER BY c.created_at ASC
        "#,
    )
    .bind(id)
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;

    let comments: Vec<serde_json::Value> = comment_rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<Uuid, _>("id"),
                "parent_id": r.get::<Option<Uuid>, _>("parent_id"),
                "depth": r.get::<i16, _>("depth"),
                "body": r.get::<String, _>("body"),
                "like_count": r.get::<i32, _>("like_count"),
                "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                "updated_at": r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("updated_at"),
                "user_id": r.get::<Uuid, _>("user_id"),
                "nickname": r.get::<Option<String>, _>("nickname"),
                "top_badge_icon": r.get::<Option<String>, _>("top_badge_icon"),
                "liked": r.get::<bool, _>("liked"),
            })
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": {
            "topic": topic,
            "comments": comments,
        },
        "error": null
    })))
}

/// POST /api/forum/topics/:id/comments
async fn create_comment(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(topic_id): Path<Uuid>,
    Json(body): Json<CreateCommentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    auth.require_nickname()?;

    // Validate body
    if body.body.is_empty() || body.body.len() > 5000 {
        return Err(AppError::BadRequest(
            "Comment body must be between 1 and 5000 characters".to_string(),
        ));
    }

    // Check topic exists and is not locked
    let topic_row = sqlx::query(
        "SELECT is_locked FROM forum_topics WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(topic_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Topic not found".to_string()))?;

    let is_locked: bool = topic_row.get("is_locked");
    if is_locked {
        return Err(AppError::Forbidden("This topic is locked".to_string()));
    }

    // Determine depth
    let (parent_id, depth): (Option<Uuid>, i16) = if let Some(pid) = body.parent_id {
        let parent_row = sqlx::query(
            "SELECT depth FROM forum_comments WHERE id = $1 AND topic_id = $2 AND deleted_at IS NULL",
        )
        .bind(pid)
        .bind(topic_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Parent comment not found".to_string()))?;

        let parent_depth: i16 = parent_row.get("depth");
        let new_depth = parent_depth + 1;

        if new_depth > 2 {
            return Err(AppError::BadRequest(
                "Maximum reply depth reached".to_string(),
            ));
        }

        (Some(pid), new_depth)
    } else {
        (None, 0)
    };

    let row = sqlx::query(
        r#"
        INSERT INTO forum_comments (topic_id, user_id, parent_id, body, depth)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at
        "#,
    )
    .bind(topic_id)
    .bind(auth.user_id)
    .bind(parent_id)
    .bind(&body.body)
    .bind(depth)
    .fetch_one(&state.db)
    .await?;

    let comment_id: Uuid = row.get("id");
    let created_at: chrono::DateTime<chrono::Utc> = row.get("created_at");

    // Update comment count
    sqlx::query(
        "UPDATE forum_topics SET comment_count = comment_count + 1 WHERE id = $1",
    )
    .bind(topic_id)
    .execute(&state.db)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": comment_id,
            "topic_id": topic_id,
            "parent_id": parent_id,
            "depth": depth,
            "body": body.body,
            "like_count": 0,
            "created_at": created_at,
            "user_id": auth.user_id,
            "nickname": auth.nickname,
        },
        "error": null
    })))
}

/// PUT /api/forum/topics/:id
async fn update_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateTopicRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify ownership
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM forum_topics WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL)",
    )
    .bind(id)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    if !exists {
        return Err(AppError::NotFound("Topic not found".to_string()));
    }

    if let Some(ref title) = body.title {
        if title.is_empty() || title.len() > 200 {
            return Err(AppError::BadRequest(
                "Title must be between 1 and 200 characters".to_string(),
            ));
        }
        sqlx::query("UPDATE forum_topics SET title = $1, updated_at = NOW() WHERE id = $2")
            .bind(title)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref body_text) = body.body {
        if body_text.is_empty() || body_text.len() > 5000 {
            return Err(AppError::BadRequest(
                "Body must be between 1 and 5000 characters".to_string(),
            ));
        }
        sqlx::query("UPDATE forum_topics SET body = $1, updated_at = NOW() WHERE id = $2")
            .bind(body_text)
            .bind(id)
            .execute(&state.db)
            .await?;
    }

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "message": "Topic updated" },
        "error": null
    })))
}

/// DELETE /api/forum/topics/:id
async fn delete_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query(
        "UPDATE forum_topics SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Topic not found".to_string()));
    }

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "message": "Topic deleted" },
        "error": null
    })))
}

/// PUT /api/forum/comments/:id
async fn update_comment(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateCommentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if body.body.is_empty() || body.body.len() > 5000 {
        return Err(AppError::BadRequest(
            "Comment body must be between 1 and 5000 characters".to_string(),
        ));
    }

    // Verify ownership
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM forum_comments WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL)",
    )
    .bind(id)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    if !exists {
        return Err(AppError::NotFound("Comment not found".to_string()));
    }

    sqlx::query("UPDATE forum_comments SET body = $1, updated_at = NOW() WHERE id = $2")
        .bind(&body.body)
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "message": "Comment updated" },
        "error": null
    })))
}

/// DELETE /api/forum/comments/:id
async fn delete_comment(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query(
        "UPDATE forum_comments SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Comment not found".to_string()));
    }

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "message": "Comment deleted" },
        "error": null
    })))
}

/// POST /api/forum/like
async fn toggle_like(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<ToggleLikeRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Validate target_type
    if body.target_type != "topic" && body.target_type != "comment" {
        return Err(AppError::BadRequest(
            "target_type must be 'topic' or 'comment'".to_string(),
        ));
    }

    // Check if already liked
    let existing = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM forum_likes WHERE user_id = $1 AND target_type = $2 AND target_id = $3)",
    )
    .bind(auth.user_id)
    .bind(&body.target_type)
    .bind(body.target_id)
    .fetch_one(&state.db)
    .await?;

    let (liked, like_count);

    if existing {
        // Unlike
        sqlx::query(
            "DELETE FROM forum_likes WHERE user_id = $1 AND target_type = $2 AND target_id = $3",
        )
        .bind(auth.user_id)
        .bind(&body.target_type)
        .bind(body.target_id)
        .execute(&state.db)
        .await?;

        // Decrement count
        if body.target_type == "topic" {
            sqlx::query(
                "UPDATE forum_topics SET like_count = like_count - 1 WHERE id = $1",
            )
            .bind(body.target_id)
            .execute(&state.db)
            .await?;

            like_count = sqlx::query_scalar::<_, i32>(
                "SELECT like_count FROM forum_topics WHERE id = $1",
            )
            .bind(body.target_id)
            .fetch_one(&state.db)
            .await?;
        } else {
            sqlx::query(
                "UPDATE forum_comments SET like_count = like_count - 1 WHERE id = $1",
            )
            .bind(body.target_id)
            .execute(&state.db)
            .await?;

            like_count = sqlx::query_scalar::<_, i32>(
                "SELECT like_count FROM forum_comments WHERE id = $1",
            )
            .bind(body.target_id)
            .fetch_one(&state.db)
            .await?;
        }

        liked = false;
    } else {
        // Like
        sqlx::query(
            "INSERT INTO forum_likes (user_id, target_type, target_id) VALUES ($1, $2, $3)",
        )
        .bind(auth.user_id)
        .bind(&body.target_type)
        .bind(body.target_id)
        .execute(&state.db)
        .await?;

        // Increment count
        if body.target_type == "topic" {
            sqlx::query(
                "UPDATE forum_topics SET like_count = like_count + 1 WHERE id = $1",
            )
            .bind(body.target_id)
            .execute(&state.db)
            .await?;

            like_count = sqlx::query_scalar::<_, i32>(
                "SELECT like_count FROM forum_topics WHERE id = $1",
            )
            .bind(body.target_id)
            .fetch_one(&state.db)
            .await?;
        } else {
            sqlx::query(
                "UPDATE forum_comments SET like_count = like_count + 1 WHERE id = $1",
            )
            .bind(body.target_id)
            .execute(&state.db)
            .await?;

            like_count = sqlx::query_scalar::<_, i32>(
                "SELECT like_count FROM forum_comments WHERE id = $1",
            )
            .bind(body.target_id)
            .fetch_one(&state.db)
            .await?;
        }

        liked = true;
    }

    Ok(Json(json!({
        "success": true,
        "data": {
            "liked": liked,
            "like_count": like_count,
        },
        "error": null
    })))
}
