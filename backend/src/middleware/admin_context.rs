// Admin authorization context extractor.
//
// Tek auth mekanizması: JWT Bearer token.
//   * brand_admin     → admin_users tablosundan login + JWT mint;
//                       claims.sub = admin_user_id (gerçek UUID).
//   * env-super       → email+password ADMIN_API_NAME/ADMIN_API_KEY
//                       eşleşince login JWT mint eder; claims.sub =
//                       `Uuid::nil()` sentinel + claims.role="super_admin".
//                       admin_users tablosunda satırı yok; identity
//                       env'den (`actor_name = ADMIN_API_NAME`).
//
// Eski `x-admin-key` header path'i tamamen kaldırıldı (BUG-1 fix:
// ADMIN_API_KEY tarayıcı localStorage'a yazılıyordu). Süper artık
// access/refresh token rotasyonu ve aynı 1h TTL'yi kullanır; XSS ile
// çalınan token en kötü 1 saatte expire olur.
//
// Impersonation modeli değişmedi: `X-Impersonate-Brand` header'ı
// env-super tokenları için okunur; brand_admin tokenlarında ignore.
//
// Authorization helpers:
//   * require_super()                — gate super-only endpoints
//   * require_brand_scope(brand_id)  — gate brand-bound endpoints
//   * require_password_changed()     — gate everything except
//                                       change-password/logout/me
//   * brand_scope()                  — Option<Uuid> for WHERE filter
//                                       injection in SQL queries

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdminRole {
    Super,
    Brand,
}

impl AdminRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            AdminRole::Super => "super_admin",
            AdminRole::Brand => "brand_admin",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, AppError> {
        match s {
            "super_admin" => Ok(AdminRole::Super),
            "brand_admin" => Ok(AdminRole::Brand),
            _ => Err(AppError::Internal(format!("unknown role: {s}"))),
        }
    }
}

/// JWT claims for admin auth tokens.
///
/// `pwc` (password-change-required) is included only when the user
/// must change password before doing anything else. Its presence
/// gates non-essential endpoints in `require_password_changed`.
///
/// `imp` (impersonating brand_id) is set when super_admin enters
/// "act as brand" mode. Mutations log this for forensics.
#[derive(Debug, Serialize, Deserialize)]
pub struct AdminClaims {
    pub sub: Uuid,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub imp: Option<Uuid>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub pwc: bool,
    pub iat: i64,
    pub exp: i64,
}

#[derive(Debug, Clone)]
pub struct AdminContext {
    /// None when authenticated via ADMIN_API_KEY (env-super).
    pub admin_user_id: Option<Uuid>,
    pub role: AdminRole,
    /// Always None for super_admin; set for brand_admin.
    pub brand_id: Option<Uuid>,
    /// Super_admin impersonating brand X — mutations should record this.
    pub impersonating_brand_id: Option<Uuid>,
    /// True while user must change password before doing anything else.
    pub password_change_required: bool,
    /// Env-super identity label (ADMIN_API_NAME). None for JWT brand_admin
    /// (use `admin_user_id` to look up email/display_name).
    pub actor_name: Option<String>,
}

impl AdminContext {
    /// Returns the brand_id this context is scoped to, if any. Used
    /// for `WHERE ($1::uuid IS NULL OR brand_id = $1)` query patterns.
    ///   * super_admin (no impersonation) → None (sees all brands)
    ///   * super_admin impersonating B    → Some(B)
    ///   * brand_admin                    → Some(self.brand_id)
    pub fn brand_scope(&self) -> Option<Uuid> {
        if let Some(imp) = self.impersonating_brand_id {
            return Some(imp);
        }
        match self.role {
            AdminRole::Super => None,
            AdminRole::Brand => self.brand_id,
        }
    }

    /// Effective acting role — accounts for impersonation. A super
    /// impersonating a brand should behave like a brand_admin.
    pub fn effective_role(&self) -> AdminRole {
        if self.impersonating_brand_id.is_some() {
            AdminRole::Brand
        } else {
            self.role
        }
    }

    pub fn require_super(&self) -> Result<(), AppError> {
        if self.effective_role() != AdminRole::Super {
            return Err(AppError::Forbidden(
                "super_admin required".to_string(),
            ));
        }
        Ok(())
    }

    /// Verify the context may operate on a record belonging to
    /// `target_brand_id`. Super (without impersonation) passes always;
    /// brand_admin (or super impersonating) must match.
    pub fn require_brand_scope(&self, target_brand_id: Uuid) -> Result<(), AppError> {
        match self.brand_scope() {
            None => Ok(()), // super sees all
            Some(scope) if scope == target_brand_id => Ok(()),
            Some(_) => Err(AppError::Forbidden(
                "brand scope mismatch".to_string(),
            )),
        }
    }

    /// Gate all endpoints except change-password/logout/me when the
    /// user is in "must change password" state.
    pub fn require_password_changed(&self) -> Result<(), AppError> {
        if self.password_change_required {
            return Err(AppError::Forbidden(
                "password_change_required".to_string(),
            ));
        }
        Ok(())
    }
}

impl FromRequestParts<AppState> for AdminContext {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // ── JWT Bearer path (env-super + brand_admin) ─────────────
        // x-admin-key path'i BUG-1 ile kaldırıldı. Tek kabul edilen
        // kimlik mekanizması: `Authorization: Bearer <jwt>`.
        let token = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or_else(|| {
                AppError::Unauthorized("missing admin credentials".to_string())
            })?;

        let key = DecodingKey::from_secret(state.config.jwt_secret.as_bytes());
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_required_spec_claims(&["sub", "exp", "iat"]);

        let data = decode::<AdminClaims>(token, &key, &validation)?;
        let claims = data.claims;

        let role = AdminRole::from_str(&claims.role)?;

        // ── Env-super JWT: sub=Uuid::nil() sentinel + role=super_admin ──
        // admin_users tablosunda satır yok; admin_user_id=None kalır
        // (mevcut handler'lar bu None'ı env-super sinyali olarak kullanıyor).
        // Impersonation X-Impersonate-Brand header'ından okunur —
        // /impersonate endpoint'i yeni token mint etmez, frontend
        // header'ı her request'te tekrar atar.
        if role == AdminRole::Super {
            if claims.sub != Uuid::nil() {
                return Err(AppError::Forbidden(
                    "super_admin JWT must use nil sub sentinel".to_string(),
                ));
            }
            // Defense in depth: env-super credential'ları runtime'da
            // boşaltılmışsa (rotation, test env) süresi dolmamış token bile
            // kabul edilmemeli — kimlik kaynağı yoksa süper yetki yok.
            if state.config.admin_api_key.is_empty()
                || state.config.admin_api_name.is_empty()
            {
                return Err(AppError::Unauthorized(
                    "env-super credentials not configured".to_string(),
                ));
            }
            let impersonating_brand_id = parts
                .headers
                .get("x-impersonate-brand")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| Uuid::parse_str(v.trim()).ok());

            return Ok(AdminContext {
                admin_user_id: None,
                role: AdminRole::Super,
                brand_id: None,
                impersonating_brand_id,
                password_change_required: false,
                actor_name: Some(state.config.admin_api_name.clone()),
            });
        }

        // ── Brand_admin JWT ─────────────────────────────────────────
        // sub gerçek admin_user_id; nil sentinel buraya düşmemeli (env-super
        // tokenıyla karışmasın). X-Impersonate-Brand header'ı bilerek
        // ignore edilir — brand_admin başka brand'i impersonate edemez.
        if claims.sub == Uuid::nil() {
            return Err(AppError::Forbidden(
                "brand_admin token must not use nil sub sentinel".to_string(),
            ));
        }
        if claims.brand_id.is_none() {
            return Err(AppError::Forbidden(
                "brand_admin token missing brand_id".to_string(),
            ));
        }

        Ok(AdminContext {
            admin_user_id: Some(claims.sub),
            role,
            brand_id: claims.brand_id,
            impersonating_brand_id: None,
            password_change_required: claims.pwc,
            actor_name: None,
        })
    }
}
