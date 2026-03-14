use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::AppState;

#[derive(Serialize)]
pub struct StatsResponse {
    pub total_dates: i64,
    pub unique_countries: i64,
    pub unique_cities: i64,
    pub average_rating: Option<f64>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(get_stats))
}

/// GET /api/stats
async fn get_stats(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query_as::<_, (i64, i64, i64, Option<f64>)>(
        r#"
        SELECT
            COUNT(*) AS total_dates,
            COUNT(DISTINCT country_code) AS unique_countries,
            COUNT(DISTINCT city_id) AS unique_cities,
            AVG(rating)::float8 AS average_rating
        FROM dates
        WHERE user_id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    let resp = StatsResponse {
        total_dates: row.0,
        unique_countries: row.1,
        unique_cities: row.2,
        average_rating: row.3,
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": resp,
        "error": null
    })))
}
