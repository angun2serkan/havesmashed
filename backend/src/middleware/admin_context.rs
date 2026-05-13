// Admin authorization context extractor.
//
// Two auth mechanisms feed AdminContext:
//   1. ADMIN_API_KEY header (`x-admin-key`) — env-tabanlı super_admin
//      kimliği. `actor_name` config.admin_api_name'den doldurulur ve
//      audit log'a yazılır. Impersonation `X-Impersonate-Brand` header'ı
//      ile yapılır; sunucu state'i tutmaz, frontend her request'te
//      header'ı tekrarlar.
//   2. JWT Bearer token (issued by /api/admin/auth/login) — brand_admin
//      auth. Decoded claims populate `admin_user_id`, `brand_id` ve
//      `pwc` (password-change-required) flag'i. super_admin artık DB'de
//      yok; JWT path'inde rol her zaman brand_admin olmalı.
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
        // ── 1. ADMIN_API_KEY path (env-super) ─────────────────────
        // Süper kimliği DB'de değil, env değişkenlerinde tutulur.
        // Impersonation `X-Impersonate-Brand` header'ı ile gelir —
        // frontend bunu localStorage'dan her request'te tekrar atar.
        if let Some(key) = parts
            .headers
            .get("x-admin-key")
            .or_else(|| parts.headers.get("x-api-key"))
            .and_then(|v| v.to_str().ok())
        {
            if key == state.config.admin_api_key {
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
            // Wrong key shouldn't fall through to JWT path — return
            // 403 so misconfigured clients get a clear signal.
            return Err(AppError::Forbidden("invalid admin key".to_string()));
        }

        // ── 2. JWT Bearer path (brand_admin only) ─────────────────
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

        // super_admin artık DB'de yok — JWT'sinde super_admin görürsek
        // bu eski/yanlış mintlenmiş token demek. Reddet.
        if role != AdminRole::Brand {
            return Err(AppError::Forbidden(
                "super_admin JWT no longer supported; use ADMIN_API_KEY".to_string(),
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
