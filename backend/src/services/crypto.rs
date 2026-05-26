use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::Claims;

/// Hash a mnemonic phrase using SHA-256.
/// 96-bit entropy mnemonic doesn't need slow hashing (Argon2) —
/// SHA-256 is sufficient and allows direct indexed DB lookup.
pub fn hash_secret(phrase: &str) -> String {
    let normalized = normalize_phrase(phrase);
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    hex::encode(hasher.finalize())
}

/// Normalize a phrase: trim, lowercase, collapse whitespace to single spaces.
fn normalize_phrase(phrase: &str) -> String {
    phrase
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Issue a JWT token signed with HS256. Returns (token, jti).
/// SEC-105 — her token unique JTI ile issue edilir; caller revocation
/// için JTI'yi saklayabilir (logout cookie/header'dan tekrar parse
/// etmek yerine).
pub fn issue_jwt(
    user_id: Uuid,
    nickname: &Option<String>,
    jwt_secret: &str,
    expiry_secs: u64,
) -> Result<String, AppError> {
    let now = chrono::Utc::now().timestamp();
    let jti = Uuid::new_v4();

    let claims = Claims {
        sub: user_id,
        nickname: nickname.clone(),
        jti: Some(jti),
        iat: now,
        exp: now + expiry_secs as i64,
    };

    let encoding_key = EncodingKey::from_secret(jwt_secret.as_bytes());
    let header = Header::new(Algorithm::HS256);

    encode(&header, &claims, &encoding_key).map_err(AppError::Jwt)
}
