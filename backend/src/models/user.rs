use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub secret_hash: String,
    pub nickname: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub invite_count: i32,
    pub is_active: bool,
    pub deletion_requested_at: Option<DateTime<Utc>>,
}

/// Lightweight projection for API responses (no secret hash).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: Uuid,
    pub nickname: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub invite_count: i32,
    pub is_active: bool,
}

impl From<User> for UserProfile {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            nickname: u.nickname,
            created_at: u.created_at,
            last_seen_at: u.last_seen_at,
            invite_count: u.invite_count,
            is_active: u.is_active,
        }
    }
}
