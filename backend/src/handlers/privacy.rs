use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::AppState;

// ── Request types ──────────────────────────────────────────────

#[derive(Deserialize)]
struct UpdatePrivacy {
    share_countries: Option<bool>,
    share_cities: Option<bool>,
    share_dates: Option<bool>,
    share_stats: Option<bool>,
}

// ── Router ──────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(get_privacy).put(update_privacy))
}

// ── Handlers ────────────────────────────────────────────────────

/// GET /api/privacy
/// Returns the current user's default privacy settings (connection_id IS NULL).
async fn get_privacy(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query_as::<_, (bool, bool, bool, bool)>(
        r#"
        SELECT share_countries, share_cities, share_dates, share_stats
        FROM privacy_settings
        WHERE user_id = $1 AND connection_id IS NULL
        "#,
    )
    .bind(auth.user_id)
    .fetch_optional(&state.db)
    .await?;

    let (share_countries, share_cities, share_dates, share_stats) =
        row.unwrap_or((true, false, false, true));

    Ok(Json(json!({
        "success": true,
        "data": {
            "share_countries": share_countries,
            "share_cities": share_cities,
            "share_dates": share_dates,
            "share_stats": share_stats,
        },
        "error": null
    })))
}

/// PUT /api/privacy
/// Upsert default privacy settings (connection_id IS NULL).
async fn update_privacy(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<UpdatePrivacy>,
) -> Result<Json<serde_json::Value>, AppError> {
    let db = &state.db;

    // Try UPDATE first (WHERE connection_id IS NULL doesn't work with ON CONFLICT)
    let result = sqlx::query(
        r#"
        UPDATE privacy_settings
        SET share_countries = COALESCE($2, share_countries),
            share_cities    = COALESCE($3, share_cities),
            share_dates     = COALESCE($4, share_dates),
            share_stats     = COALESCE($5, share_stats)
        WHERE user_id = $1 AND connection_id IS NULL
        "#,
    )
    .bind(auth.user_id)
    .bind(body.share_countries)
    .bind(body.share_cities)
    .bind(body.share_dates)
    .bind(body.share_stats)
    .execute(db)
    .await?;

    if result.rows_affected() == 0 {
        // No existing row — insert with defaults merged
        sqlx::query(
            r#"
            INSERT INTO privacy_settings (user_id, connection_id, share_countries, share_cities, share_dates, share_stats)
            VALUES ($1, NULL, $2, $3, $4, $5)
            "#,
        )
        .bind(auth.user_id)
        .bind(body.share_countries.unwrap_or(true))
        .bind(body.share_cities.unwrap_or(false))
        .bind(body.share_dates.unwrap_or(false))
        .bind(body.share_stats.unwrap_or(true))
        .execute(db)
        .await?;
    }

    // Fetch the updated row to return
    let row = sqlx::query_as::<_, (bool, bool, bool, bool)>(
        r#"
        SELECT share_countries, share_cities, share_dates, share_stats
        FROM privacy_settings
        WHERE user_id = $1 AND connection_id IS NULL
        "#,
    )
    .bind(auth.user_id)
    .fetch_one(db)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "share_countries": row.0,
            "share_cities": row.1,
            "share_dates": row.2,
            "share_stats": row.3,
        },
        "error": null
    })))
}

