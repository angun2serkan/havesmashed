use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct DateEntry {
    pub id: Uuid,
    pub user_id: Uuid,
    pub country_code: String,
    pub city_id: i32,
    pub gender: String,
    pub age_range: String,
    pub description: Option<String>,
    pub rating: i32,
    pub date_at: NaiveDate,
    pub created_at: DateTime<Utc>,
    pub updated_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDateRequest {
    pub country_code: String,
    pub city_id: i32,
    pub gender: String,
    pub age_range: String,
    pub description: Option<String>,
    pub rating: i32,
    pub date_at: NaiveDate,
    /// Tag IDs to associate with this date (meeting, venue, activity, physical tags).
    pub tag_ids: Vec<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDateRequest {
    pub country_code: Option<String>,
    pub city_id: Option<i32>,
    pub gender: Option<String>,
    pub age_range: Option<String>,
    pub description: Option<String>,
    pub rating: Option<i32>,
    pub date_at: Option<NaiveDate>,
    /// If provided, replaces all existing tag associations.
    pub tag_ids: Option<Vec<i32>>,
}
