use argon2::password_hash::{rand_core::OsRng, SaltString};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::Claims;

/// Hash a mnemonic phrase using Argon2id.
pub fn hash_secret(phrase: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(phrase.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(format!("Hash error: {e}")))?;
    Ok(hash.to_string())
}

/// Verify a mnemonic phrase against its Argon2 hash.
pub fn verify_secret(phrase: &str, hash: &str) -> Result<bool, AppError> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(format!("Invalid hash format: {e}")))?;
    let argon2 = Argon2::default();
    match argon2.verify_password(phrase.as_bytes(), &parsed_hash) {
        Ok(()) => Ok(true),
        Err(argon2::password_hash::Error::Password) => Ok(false),
        Err(e) => Err(AppError::Internal(format!("Verify error: {e}"))),
    }
}

/// Issue a JWT token signed with HS256.
pub fn issue_jwt(
    user_id: Uuid,
    nickname: &Option<String>,
    jwt_secret: &str,
    expiry_secs: u64,
) -> Result<String, AppError> {
    let now = chrono::Utc::now().timestamp();

    let claims = Claims {
        sub: user_id,
        nickname: nickname.clone(),
        iat: now,
        exp: now + expiry_secs as i64,
    };

    let encoding_key = EncodingKey::from_secret(jwt_secret.as_bytes());
    let header = Header::new(Algorithm::HS256);

    encode(&header, &claims, &encoding_key).map_err(AppError::Jwt)
}
