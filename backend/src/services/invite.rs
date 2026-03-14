use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;

const INVITE_TTL_SECS: u64 = 86400; // 24 hours

#[derive(Debug, Serialize, Deserialize)]
pub struct InviteData {
    pub inviter_id: Uuid,
    pub created_at: String,
    pub invite_type: InviteType,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum InviteType {
    /// Platform invite — creates a new user account. Subject to limits (3/month, 10 total).
    Platform,
    /// Friend invite — sends a friend request to existing user. No limits.
    Friend,
}

/// Store an invite in Redis with 24h TTL.
pub async fn store_invite(
    conn: &mut redis::aio::ConnectionManager,
    invite_id: Uuid,
    data: &InviteData,
) -> Result<(), AppError> {
    let key = format!("invite:{invite_id}");
    let value = serde_json::to_string(data)
        .map_err(|e| AppError::Internal(format!("Serialize invite: {e}")))?;

    conn.set_ex::<_, _, ()>(&key, &value, INVITE_TTL_SECS)
        .await
        .map_err(AppError::Redis)?;

    Ok(())
}

/// Consume an invite atomically (GET + DEL). Returns None if expired/used.
pub async fn consume_invite(
    conn: &mut redis::aio::ConnectionManager,
    invite_id: Uuid,
) -> Result<Option<InviteData>, AppError> {
    let key = format!("invite:{invite_id}");

    let value: Option<String> = conn.get_del(&key).await.map_err(AppError::Redis)?;

    match value {
        Some(json) => {
            let data: InviteData = serde_json::from_str(&json)
                .map_err(|e| AppError::Internal(format!("Deserialize invite: {e}")))?;
            Ok(Some(data))
        }
        None => Ok(None),
    }
}
