// User authentication context extractor.
//
// Token transport (SEC-102): öncelik httpOnly cookie (user_access_token).
// Cookie yoksa `Authorization: Bearer <jwt>` header'ına düşer — frontend
// cookie path'ine geçti ama dış tooling, manuel curl ve geçiş dönemindeki
// eski browser cache'leri için fallback bir release boyunca korunuyor.
// Sonraki PR'da Authorization fallback silinecek.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub nickname: Option<String>,
    pub iat: i64,
    pub exp: i64,
}

/// Extractor that verifies JWT and provides the authenticated user ID.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub nickname: Option<String>,
}

impl AuthUser {
    /// Returns an error if the user has not set a nickname yet.
    pub fn require_nickname(&self) -> Result<&str, AppError> {
        self.nickname
            .as_deref()
            .ok_or_else(|| AppError::Forbidden("You must set a nickname before performing this action".to_string()))
    }
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // SEC-102: cookie öncelikli, Authorization fallback.
        let token: String = cookie_access_token(parts)
            .or_else(|| {
                parts
                    .headers
                    .get("authorization")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.strip_prefix("Bearer "))
                    .map(|s| s.to_string())
            })
            .ok_or_else(|| AppError::Unauthorized("Missing authorization header".to_string()))?;

        let decoding_key = DecodingKey::from_secret(state.config.jwt_secret.as_bytes());
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_required_spec_claims(&["sub", "exp", "iat"]);

        let token_data = decode::<Claims>(&token, &decoding_key, &validation)?;

        Ok(AuthUser {
            user_id: token_data.claims.sub,
            nickname: token_data.claims.nickname,
        })
    }
}

/// Cookie header'dan `user_access_token` değerini ayıkla. Minimal RFC 6265
/// parser: `name=value; name=value` formatında split + ilk eşleşme.
fn cookie_access_token(parts: &Parts) -> Option<String> {
    parts
        .headers
        .get(axum::http::header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|cookie_header| {
            cookie_header
                .split(';')
                .map(str::trim)
                .find_map(|pair| {
                    let (k, v) = pair.split_once('=')?;
                    if k == "user_access_token" {
                        Some(v.to_string())
                    } else {
                        None
                    }
                })
        })
}
