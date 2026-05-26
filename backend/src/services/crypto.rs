use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::{Claims, JWT_AUDIENCE_USER, JWT_ISSUER};

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
        // SEC-106 — iss/aud her yeni user token'ına gömülür; admin
        // endpoint'ine atılırsa middleware audience mismatch ile reddeder.
        iss: Some(JWT_ISSUER.to_string()),
        aud: Some(JWT_AUDIENCE_USER.to_string()),
        iat: now,
        exp: now + expiry_secs as i64,
    };

    let encoding_key = EncodingKey::from_secret(jwt_secret.as_bytes());
    let header = Header::new(Algorithm::HS256);

    encode(&header, &claims, &encoding_key).map_err(AppError::Jwt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::middleware::auth::JWT_AUDIENCE_ADMIN;
    use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

    fn decode_claims(token: &str, secret: &str, validate_aud: bool, aud: Option<&str>) -> Result<Claims, jsonwebtoken::errors::Error> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_required_spec_claims(&["sub", "exp", "iat"]);
        validation.validate_aud = validate_aud;
        if let Some(a) = aud {
            validation.set_audience(&[a]);
        }
        let key = DecodingKey::from_secret(secret.as_bytes());
        decode::<Claims>(token, &key, &validation).map(|d| d.claims)
    }

    // SEC-106 — yeni user token'ları iss + aud="user" taşımalı.
    #[test]
    fn issue_jwt_includes_iss_and_aud() {
        let secret = "test_secret_at_least_64_chars_long_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
        let uid = Uuid::now_v7();
        let token = issue_jwt(uid, &None, secret, 3600).unwrap();
        let claims = decode_claims(&token, secret, false, None).unwrap();
        assert_eq!(claims.iss.as_deref(), Some(JWT_ISSUER));
        assert_eq!(claims.aud.as_deref(), Some(JWT_AUDIENCE_USER));
    }

    // SEC-106 — user token admin audience validation'ı geçmemeli.
    // jsonwebtoken kütüphanesi aud claim'ini gördüğü için set_audience(&[admin])
    // mismatch ile reddeder; bu, runtime'daki manuel kontrolün dayandığı
    // claim'in token'da fiilen var olduğunu kanıtlar.
    #[test]
    fn user_token_rejected_for_admin_audience() {
        let secret = "test_secret_at_least_64_chars_long_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
        let uid = Uuid::now_v7();
        let token = issue_jwt(uid, &None, secret, 3600).unwrap();
        let err = decode_claims(&token, secret, true, Some(JWT_AUDIENCE_ADMIN)).unwrap_err();
        assert!(matches!(
            err.kind(),
            jsonwebtoken::errors::ErrorKind::InvalidAudience
        ));
    }
}
