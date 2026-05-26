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
use crate::services::jwt_revocation;
use crate::AppState;

/// SEC-105 logout-all scope label — Redis key namespacing.
pub const REVOCATION_SCOPE_USER: &str = "user";

/// SEC-106 — JWT issuer; tüm haveismash JWT'leri için ortak. Audience'la
/// birlikte cross-context token reuse (CWE-863) kapatır: aynı JWT_SECRET'i
/// paylaşan başka bir servis aynı imza algoritmasıyla token üretse bile
/// issuer kontrolünden geçemez.
pub const JWT_ISSUER: &str = "haveismash.com";

/// SEC-106 — user JWT audience. Admin token'ı user endpoint'inde (veya
/// tersi) kullanılırsa audience mismatch ile 401.
pub const JWT_AUDIENCE_USER: &str = "user";

/// SEC-106 — admin JWT audience.
pub const JWT_AUDIENCE_ADMIN: &str = "admin";

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub nickname: Option<String>,
    /// SEC-105 — token-unique id; Redis revocation list key. Option:
    /// SEC-105 öncesi issue edilmiş legacy token'larda alan yok.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub jti: Option<Uuid>,
    /// SEC-106 — issuer + audience claims. Option çünkü SEC-106 öncesi
    /// token'lar bu alanları taşımıyor; bir release grace period sonra
    /// zorunlu yapılacak.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iss: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aud: Option<String>,
    pub iat: i64,
    pub exp: i64,
}

/// Extractor that verifies JWT and provides the authenticated user ID.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub nickname: Option<String>,
    /// SEC-105 — current token's JTI (None for legacy tokens).
    pub jti: Option<Uuid>,
    /// SEC-105 — token issue/expire timestamps; logout handler revocation
    /// TTL'i hesabı için.
    pub iat: i64,
    pub exp: i64,
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
        // SEC-106: manuel doğruluyoruz (legacy token'larda iss/aud yok).
        // jsonwebtoken default'unda validate_aud=true; aud claim yoksa
        // hata verir → legacy uyumu için kapatıyoruz.
        validation.validate_aud = false;

        let token_data = decode::<Claims>(&token, &decoding_key, &validation)?;
        let claims = token_data.claims;

        // SEC-106 — iss/aud manuel kontrolü. Token bu alanları taşıyorsa
        // beklenen değerle eşleşmek zorunda; yoksa legacy grace period.
        if let Some(iss) = claims.iss.as_deref() {
            if iss != JWT_ISSUER {
                return Err(AppError::Unauthorized("invalid token issuer".to_string()));
            }
        }
        if let Some(aud) = claims.aud.as_deref() {
            if aud != JWT_AUDIENCE_USER {
                return Err(AppError::Unauthorized(
                    "token audience mismatch".to_string(),
                ));
            }
        }

        // SEC-105 — JTI revocation + logout-all-before check'leri.
        // Legacy token'larda jti yok → skip (grace period); logout-all
        // her zaman çalışır.
        let mut redis = state.redis.clone();
        if let Some(jti) = claims.jti {
            if jwt_revocation::is_jti_revoked(&mut redis, jti).await {
                return Err(AppError::Unauthorized("token revoked".to_string()));
            }
        }
        if let Some(threshold) =
            jwt_revocation::logout_all_before(&mut redis, REVOCATION_SCOPE_USER, claims.sub).await
        {
            if claims.iat < threshold {
                return Err(AppError::Unauthorized(
                    "all sessions revoked — please log in again".to_string(),
                ));
            }
        }

        Ok(AuthUser {
            user_id: claims.sub,
            nickname: claims.nickname,
            jti: claims.jti,
            iat: claims.iat,
            exp: claims.exp,
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
