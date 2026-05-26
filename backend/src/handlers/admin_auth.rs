// Admin user authentication: login, refresh, logout, change-password,
// /me, and "act as brand" impersonation.
//
// İki ayrı kimlik modeli — TEK transport (JWT):
//   * brand_admin → admin_users tablosundaki email + password.
//     Login → JWT (1h access + 30d refresh). claims.sub = admin_user_id.
//   * super_admin → env-tabanlı (ADMIN_API_NAME + ADMIN_API_KEY).
//     Login → JWT (1h access + 30d refresh). claims.sub = Uuid::nil()
//     sentinel + claims.role = "super_admin". DB satırı yok.
//     Impersonation: `/impersonate` audit yazar, frontend
//     `X-Impersonate-Brand` header'ı ile state'i sürdürür.
//
// Eski `x-admin-key` header path'i BUG-1 fix ile kaldırıldı; env-super
// artık tarayıcıda localStorage'da düz API key bırakmaz, kısa ömürlü
// JWT taşır.
//
// T0.3 force-change semantics (brand_admin):
//   * `must_change_password=TRUE` ise login başarılı olur ama token
//     `pwc: true` taşır. AdminContext'in `require_password_changed()`
//     guard'ı diğer tüm endpoint'leri reddeder.
//   * change-password endpoint'i `pwc:true` token'ını kabul eder,
//     flag'i temizler ve `pwc` olmadan yeni token döner.
//   * env-super'in pwc'si yoktur (DB satırı yok), refresh akışında
//     `sub == Uuid::nil()` kısa-yolu çalışır.

use axum::extract::State;
use axum::http::header::SET_COOKIE;
use axum::http::HeaderValue;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::admin_context::{AdminClaims, AdminContext, AdminRole};
use crate::services::{csrf, password};
use crate::AppState;

const ACCESS_TTL_SECS: i64 = 60 * 60;        // 1 hour
const REFRESH_TTL_SECS: i64 = 60 * 60 * 24 * 30; // 30 days
const LOCKOUT_THRESHOLD: i64 = 5;
const LOCKOUT_WINDOW_SECS: i64 = 60 * 15;    // 15 minutes

// ── Cookie configuration (SEC-101) ───────────────────────────────
// httpOnly + SameSite=Strict cookies so a stored XSS in the admin panel
// cannot read the JWT via document.cookie. `Secure` flag set only in
// prod — dev runs HTTP on localhost (mkcert not yet standardised) and
// browsers reject Secure cookies on insecure origins.
//
// Path scoping limits the cookie to admin-API requests:
//   * access  → /api/admin   (every authenticated admin endpoint)
//   * refresh → /api/admin/auth/refresh (only sent when refreshing)
//
// `admin_` prefix distinguishes from any future user-side cookies
// (SEC-102) when both apps are inspected side by side.
pub(crate) const ACCESS_COOKIE_NAME: &str = "admin_access_token";
pub(crate) const REFRESH_COOKIE_NAME: &str = "admin_refresh_token";
const ACCESS_COOKIE_PATH: &str = "/api/admin";
const REFRESH_COOKIE_PATH: &str = "/api/admin/auth/refresh";

// SEC-103 — CSRF double-submit token. HttpOnly DEĞİL (frontend JS okumalı),
// SameSite=Strict, access cookie ile aynı path scope. Token her login/
// refresh/change-password'da rotate edilir.
const CSRF_COOKIE_NAME: &str = "admin_csrf_token";
const CSRF_COOKIE_PATH: &str = "/api/admin";

fn build_cookie(name: &str, value: &str, path: &str, max_age: i64, secure: bool) -> String {
    let secure_attr = if secure { "; Secure" } else { "" };
    format!(
        "{name}={value}; HttpOnly{secure_attr}; SameSite=Strict; Path={path}; Max-Age={max_age}"
    )
}

/// SEC-103: CSRF cookie HttpOnly DEĞİL — frontend JS okumak zorunda
/// (double-submit pattern). Diğer attribute'lar access cookie ile aynı.
fn build_csrf_cookie(value: &str, max_age: i64, secure: bool) -> String {
    let secure_attr = if secure { "; Secure" } else { "" };
    format!(
        "{CSRF_COOKIE_NAME}={value}{secure_attr}; SameSite=Strict; Path={CSRF_COOKIE_PATH}; Max-Age={max_age}"
    )
}

/// (access_cookie, refresh_cookie, csrf_cookie, csrf_token_value).
/// CSRF token'ını response body'sine de koyabilmek için raw değer
/// olarak da döndürüyoruz (frontend ilk login'de header'a yerleştirebilir
/// ya da cookie'den de okuyabilir).
fn auth_cookies(access: &str, refresh: &str, is_production: bool) -> ([String; 3], String) {
    let csrf_token = csrf::generate_token();
    let cookies = [
        build_cookie(
            ACCESS_COOKIE_NAME,
            access,
            ACCESS_COOKIE_PATH,
            ACCESS_TTL_SECS,
            is_production,
        ),
        build_cookie(
            REFRESH_COOKIE_NAME,
            refresh,
            REFRESH_COOKIE_PATH,
            REFRESH_TTL_SECS,
            is_production,
        ),
        build_csrf_cookie(&csrf_token, ACCESS_TTL_SECS, is_production),
    ];
    (cookies, csrf_token)
}

fn clear_auth_cookies(is_production: bool) -> [String; 3] {
    [
        build_cookie(
            ACCESS_COOKIE_NAME,
            "",
            ACCESS_COOKIE_PATH,
            0,
            is_production,
        ),
        build_cookie(
            REFRESH_COOKIE_NAME,
            "",
            REFRESH_COOKIE_PATH,
            0,
            is_production,
        ),
        build_csrf_cookie("", 0, is_production),
    ]
}

fn json_with_cookies(body: Value, cookies: [String; 3]) -> Response {
    let mut response = Json(body).into_response();
    let headers = response.headers_mut();
    for cookie in cookies {
        // Cookie değeri ASCII printable kalıyor (base64 JWT/token) — parse
        // hatası pratikte imkansız; yine de Result'ı silently drop ediyoruz
        // ki bir teorik fuzz girdisi response'u kırmasın.
        if let Ok(value) = HeaderValue::from_str(&cookie) {
            headers.append(SET_COOKIE, value);
        }
    }
    response
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/refresh", post(refresh))
        .route("/auth/logout", post(logout))
        .route("/auth/change-password", post(change_password))
        .route("/me", get(me))
        .route("/impersonate", post(impersonate_start))
        .route("/impersonate/stop", post(impersonate_stop))
}

// ════════════════════════════════════════════════════════════════
// POST /api/admin/auth/login
// ════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct LoginBody {
    email: String,
    password: String,
}

#[derive(sqlx::FromRow)]
struct AdminUserRow {
    id: Uuid,
    password_hash: String,
    display_name: String,
    role: String,
    brand_id: Option<Uuid>,
    is_active: bool,
    must_change_password: bool,
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginBody>,
) -> Result<Response, AppError> {
    // 1. super_admin shortcut: email == ADMIN_API_NAME && password == ADMIN_API_KEY
    //    Frontend tek bir login formu kullanıyor; rol seçimini backend yapar.
    //    Lockout brand_admin'den ayrı (kendi rate-limit anahtarı), env-super
    //    credential'larını çalan biri admin_users tablosunu kilitlemesin.
    let email_input = body.email.trim();
    let mut redis = state.redis.clone();
    let super_lock_key = format!("adminlogin:super-lock:{}", email_input.to_lowercase());
    let super_fail_count: i64 = redis.get::<_, i64>(&super_lock_key).await.unwrap_or(0);

    if !state.config.admin_api_name.is_empty()
        && email_input.eq_ignore_ascii_case(&state.config.admin_api_name)
    {
        if super_fail_count >= LOCKOUT_THRESHOLD {
            return Err(AppError::LimitExceeded(
                "Too many failed login attempts. Try again in 15 minutes.".to_string(),
            ));
        }
        if body.password == state.config.admin_api_key {
            let _: Result<(), _> = redis.del(&super_lock_key).await;
            // Env-super JWT: sub=Uuid::nil() sentinel, role=super_admin.
            // DB satırı yok; identity tamamen env değişkenlerinden gelir.
            // Refresh ve admin_context bu sentinel'i tanır ve özel yol işler.
            let (access_token, refresh_token) =
                issue_super_tokens(&state.config.jwt_secret, None)?;
            // SEC-101: token'ları hem cookie hem body'de döndür. SEC-103:
            // CSRF token cookie'si (JS-okunabilir) + body'de raw değer.
            let (cookies, csrf_token) =
                auth_cookies(&access_token, &refresh_token, state.config.is_production);
            return Ok(json_with_cookies(
                json!({
                    "success": true,
                    "data": {
                        "auth_method": "jwt",
                        "access_token": access_token,
                        "refresh_token": refresh_token,
                        "csrf_token": csrf_token,
                        "must_change_password": false,
                        "user": {
                            "id": null,
                            "display_name": state.config.admin_api_name,
                            "role": "super_admin",
                            "brand_id": null,
                        },
                    },
                    "error": null,
                }),
                cookies,
            ));
        }
        // ADMIN_API_NAME doğru ama key yanlış — başka yere düşmesin
        record_failure(&mut redis, &super_lock_key).await;
        return Err(AppError::Unauthorized("Invalid credentials".to_string()));
    }

    // 2. brand_admin login — admin_users lookup
    let lockout_key = format!("adminlogin:lock:{}", body.email.to_lowercase());
    let fail_count: i64 = redis.get(&lockout_key).await.unwrap_or(0);
    if fail_count >= LOCKOUT_THRESHOLD {
        return Err(AppError::LimitExceeded(
            "Too many failed login attempts. Try again in 15 minutes.".to_string(),
        ));
    }

    // Look up user (case-insensitive email match would be nice but
    //    requires citext; MVP enforces lowercase emails by convention).
    let user: Option<AdminUserRow> = sqlx::query_as(
        r#"
        SELECT id, password_hash, display_name, role, brand_id, is_active,
               must_change_password
        FROM admin_users
        WHERE email = $1
        "#,
    )
    .bind(&body.email)
    .fetch_optional(&state.db)
    .await?;

    let Some(user) = user else {
        // Constant-time-ish failure: still hash a fake password so
        // attackers can't enumerate emails via timing.
        let _ = password::verify_password(&body.password, "$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        record_failure(&mut redis, &lockout_key).await;
        return Err(AppError::Unauthorized("Invalid credentials".to_string()));
    };

    if !user.is_active {
        record_failure(&mut redis, &lockout_key).await;
        return Err(AppError::Forbidden("Account is disabled".to_string()));
    }

    let ok = password::verify_password(&body.password, &user.password_hash)?;
    if !ok {
        record_failure(&mut redis, &lockout_key).await;
        return Err(AppError::Unauthorized("Invalid credentials".to_string()));
    }

    // 3. Clear lockout counter on success
    let _: Result<(), _> = redis.del(&lockout_key).await;

    // 4. Update last_login_at (best-effort; failure doesn't block login)
    let _ = sqlx::query("UPDATE admin_users SET last_login_at = NOW() WHERE id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await;

    // 5. Sadece brand_admin login olabilir. super_admin DB'den kaldırıldı.
    let role = AdminRole::from_str(&user.role)?;
    if role != AdminRole::Brand {
        return Err(AppError::Forbidden(
            "super_admin must authenticate with ADMIN_API_KEY".to_string(),
        ));
    }
    let (access_token, refresh_token) =
        issue_tokens(&state.config.jwt_secret, &user, &role, None)?;

    let (cookies, csrf_token) =
        auth_cookies(&access_token, &refresh_token, state.config.is_production);
    Ok(json_with_cookies(
        json!({
            "success": true,
            "data": {
                "auth_method": "jwt",
                "access_token": access_token,
                "refresh_token": refresh_token,
                "csrf_token": csrf_token,
                "must_change_password": user.must_change_password,
                "user": {
                    "id": user.id,
                    "display_name": user.display_name,
                    "role": user.role,
                    "brand_id": user.brand_id,
                },
            },
            "error": null,
        }),
        cookies,
    ))
}

async fn record_failure(redis: &mut redis::aio::ConnectionManager, key: &str) {
    let _: Result<i64, _> = redis.incr(key, 1).await;
    let _: Result<bool, _> = redis.expire(key, LOCKOUT_WINDOW_SECS).await;
}

fn issue_tokens(
    secret: &str,
    user: &AdminUserRow,
    role: &AdminRole,
    impersonating: Option<Uuid>,
) -> Result<(String, String), AppError> {
    let now = Utc::now().timestamp();
    let access_claims = AdminClaims {
        sub: user.id,
        role: role.as_str().to_string(),
        brand_id: user.brand_id,
        imp: impersonating,
        pwc: user.must_change_password,
        iat: now,
        exp: now + ACCESS_TTL_SECS,
    };
    let refresh_claims = AdminClaims {
        sub: user.id,
        role: role.as_str().to_string(),
        brand_id: user.brand_id,
        imp: impersonating,
        pwc: user.must_change_password,
        iat: now,
        exp: now + REFRESH_TTL_SECS,
    };
    let key = EncodingKey::from_secret(secret.as_bytes());
    let header = Header::new(Algorithm::HS256);
    let access = encode(&header, &access_claims, &key).map_err(AppError::Jwt)?;
    let refresh = encode(&header, &refresh_claims, &key).map_err(AppError::Jwt)?;
    Ok((access, refresh))
}

/// Env-super token mint helper. `sub = Uuid::nil()` sentinel + role=super_admin;
/// DB lookup yok. `impersonating` parametresi `/impersonate` flow'unu
/// gelecekteki bir refactor token'a taşımak isterse kullanılabilir (şu an
/// frontend X-Impersonate-Brand header'ı ile state'i sürdürüyor, bu yüzden
/// burada her zaman None geliyor).
fn issue_super_tokens(
    secret: &str,
    impersonating: Option<Uuid>,
) -> Result<(String, String), AppError> {
    let now = Utc::now().timestamp();
    let mk_claims = |exp_offset: i64| AdminClaims {
        sub: Uuid::nil(),
        role: AdminRole::Super.as_str().to_string(),
        brand_id: None,
        imp: impersonating,
        pwc: false,
        iat: now,
        exp: now + exp_offset,
    };
    let key = EncodingKey::from_secret(secret.as_bytes());
    let header = Header::new(Algorithm::HS256);
    let access = encode(&header, &mk_claims(ACCESS_TTL_SECS), &key).map_err(AppError::Jwt)?;
    let refresh = encode(&header, &mk_claims(REFRESH_TTL_SECS), &key).map_err(AppError::Jwt)?;
    Ok((access, refresh))
}

// ════════════════════════════════════════════════════════════════
// POST /api/admin/auth/refresh
// ════════════════════════════════════════════════════════════════
//
// SEC-101: refresh token cookie (httpOnly, Path=/api/admin/auth/refresh)
// olarak gönderilir. Geçiş döneminde body'deki `refresh_token` alanını
// da kabul ediyoruz — eski deploy edilmiş admin bundle'ları cookie
// göndermez, body göndermeye devam eder. Bir sonraki release'de body
// path'i kaldırılacak.

#[derive(Default, Deserialize)]
struct RefreshBody {
    #[serde(default)]
    refresh_token: Option<String>,
}

async fn refresh(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    body: Option<Json<RefreshBody>>,
) -> Result<Response, AppError> {
    // Cookie first, body fallback. Hard 400 yerine 401 — auth context
    // sorunu olduğunu netleştirir.
    let token = cookie_value(&headers, REFRESH_COOKIE_NAME)
        .or_else(|| body.and_then(|b| b.0.refresh_token))
        .ok_or_else(|| {
            AppError::Unauthorized("missing refresh token".to_string())
        })?;

    let key = jsonwebtoken::DecodingKey::from_secret(state.config.jwt_secret.as_bytes());
    let mut validation = jsonwebtoken::Validation::new(Algorithm::HS256);
    validation.set_required_spec_claims(&["sub", "exp", "iat"]);
    let data = jsonwebtoken::decode::<AdminClaims>(&token, &key, &validation)?;
    let claims = data.claims;

    // ── Env-super refresh: sub=Uuid::nil() sentinel ─────────────
    // DB satırı olmadığı için fresh mint yeterli; impersonation
    // claim'i (imp) korunur. Yanlış token'ı (sub=nil ama role!=super)
    // reddet. Ayrıca env-super credential'ları runtime'da boşaltılmışsa
    // (config rotation, test env), token'ı reddet — kimlik kaynağı
    // ortadan kalktığında eski token süresi dolana kadar kabul edilmemeli.
    if claims.sub == Uuid::nil() {
        if claims.role != AdminRole::Super.as_str() {
            return Err(AppError::Unauthorized(
                "nil-sub token must carry role=super_admin".to_string(),
            ));
        }
        if state.config.admin_api_key.is_empty()
            || state.config.admin_api_name.is_empty()
        {
            return Err(AppError::Unauthorized(
                "env-super credentials not configured".to_string(),
            ));
        }
        let (access_token, refresh_token) =
            issue_super_tokens(&state.config.jwt_secret, claims.imp)?;
        let (cookies, csrf_token) =
            auth_cookies(&access_token, &refresh_token, state.config.is_production);
        return Ok(json_with_cookies(
            json!({
                "success": true,
                "data": {
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "csrf_token": csrf_token,
                    "must_change_password": false,
                },
                "error": null,
            }),
            cookies,
        ));
    }

    // ── Brand_admin refresh ────────────────────────────────────
    // Re-fetch the user — must_change_password, role, brand_id may
    // have changed since token issue. Refresh always reflects DB truth.
    let user: AdminUserRow = sqlx::query_as(
        r#"
        SELECT id, password_hash, display_name, role, brand_id, is_active,
               must_change_password
        FROM admin_users
        WHERE id = $1
        "#,
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("user not found".to_string()))?;

    if !user.is_active {
        return Err(AppError::Forbidden("Account is disabled".to_string()));
    }

    let role = AdminRole::from_str(&user.role)?;
    let (access_token, refresh_token) =
        issue_tokens(&state.config.jwt_secret, &user, &role, claims.imp)?;

    let (cookies, csrf_token) =
        auth_cookies(&access_token, &refresh_token, state.config.is_production);
    Ok(json_with_cookies(
        json!({
            "success": true,
            "data": {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "csrf_token": csrf_token,
                "must_change_password": user.must_change_password,
            },
            "error": null,
        }),
        cookies,
    ))
}

/// Cookie header'dan tek bir cookie değerini çıkar. RFC 6265 minimal parser:
/// `name1=value1; name2=value2` formatını split eder. Quote'lanmış değer
/// veya escape karakteri yok (JWT base64url ASCII güvenli).
fn cookie_value(headers: &axum::http::HeaderMap, name: &str) -> Option<String> {
    headers
        .get(axum::http::header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|cookie_header| {
            cookie_header
                .split(';')
                .map(str::trim)
                .find_map(|pair| {
                    let (k, v) = pair.split_once('=')?;
                    if k == name {
                        Some(v.to_string())
                    } else {
                        None
                    }
                })
        })
}

// ════════════════════════════════════════════════════════════════
// POST /api/admin/auth/logout
// ════════════════════════════════════════════════════════════════
// SEC-101: server-side cookie expire. JWT revocation list (SEC-105)
// gelene kadar token'ın kendi expiry'sine kadar valid kalır — ama
// browser cookie expire edildiği için pratik olarak kullanılamaz.

async fn logout(
    State(state): State<AppState>,
    _ctx: AdminContext,
) -> Result<Response, AppError> {
    Ok(json_with_cookies(
        json!({ "success": true, "data": { "ok": true }, "error": null }),
        clear_auth_cookies(state.config.is_production),
    ))
}

// ════════════════════════════════════════════════════════════════
// POST /api/admin/auth/change-password
// ════════════════════════════════════════════════════════════════
// Accepts both normal users (changing voluntarily) and pwc:true
// users (forced first-login change). Validates the current password
// before storing the new hash so a stolen access token alone can't
// change the password.

#[derive(Deserialize)]
struct ChangePasswordBody {
    current_password: String,
    new_password: String,
}

async fn change_password(
    State(state): State<AppState>,
    ctx: AdminContext,
    Json(body): Json<ChangePasswordBody>,
) -> Result<Response, AppError> {
    // ADMIN_API_KEY synthetic super has no user to change password for.
    let admin_user_id = ctx
        .admin_user_id
        .ok_or_else(|| {
            AppError::Forbidden(
                "env-super has no password — şifre `.env` üzerinden yönetilir".to_string(),
            )
        })?;

    password::validate_password_policy(&body.new_password)?;

    let row: (String, bool) = sqlx::query_as(
        "SELECT password_hash, is_active FROM admin_users WHERE id = $1",
    )
    .bind(admin_user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("user not found".to_string()))?;

    if !row.1 {
        return Err(AppError::Forbidden("Account is disabled".to_string()));
    }
    let ok = password::verify_password(&body.current_password, &row.0)?;
    if !ok {
        return Err(AppError::Unauthorized(
            "current password is incorrect".to_string(),
        ));
    }

    if body.new_password == body.current_password {
        return Err(AppError::BadRequest(
            "new password must differ from current password".to_string(),
        ));
    }

    let new_hash = password::hash_password(&body.new_password)?;
    sqlx::query(
        r#"
        UPDATE admin_users
        SET password_hash = $2,
            must_change_password = FALSE,
            password_changed_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(admin_user_id)
    .bind(&new_hash)
    .execute(&state.db)
    .await?;

    // Audit log entry — admin_user changed their own password.
    let _ = sqlx::query(
        r#"
        INSERT INTO ad_audit_log
            (actor, action, target_kind, target_id, diff, admin_user_id)
        VALUES ($1, $2, 'admin_user', $3, $4, $3)
        "#,
    )
    .bind(format!("admin_user:{admin_user_id}"))
    .bind("password_change")
    .bind(admin_user_id)
    .bind(json!({ "self": true }))
    .execute(&state.db)
    .await;

    // Issue a fresh token without pwc so the client can continue.
    let user: AdminUserRow = sqlx::query_as(
        r#"
        SELECT id, password_hash, display_name, role, brand_id, is_active,
               must_change_password
        FROM admin_users
        WHERE id = $1
        "#,
    )
    .bind(admin_user_id)
    .fetch_one(&state.db)
    .await?;
    let role = AdminRole::from_str(&user.role)?;
    let (access_token, refresh_token) =
        issue_tokens(&state.config.jwt_secret, &user, &role, ctx.impersonating_brand_id)?;

    let (cookies, csrf_token) =
        auth_cookies(&access_token, &refresh_token, state.config.is_production);
    Ok(json_with_cookies(
        json!({
            "success": true,
            "data": {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "csrf_token": csrf_token,
                "must_change_password": false,
            },
            "error": null,
        }),
        cookies,
    ))
}

// ════════════════════════════════════════════════════════════════
// GET /api/admin/me
// ════════════════════════════════════════════════════════════════

async fn me(
    State(state): State<AppState>,
    ctx: AdminContext,
) -> Result<Json<Value>, AppError> {
    // Env-super (ADMIN_API_KEY) path: synthetic profile, display_name
    // ADMIN_API_NAME'den gelir. Impersonating brand X-Impersonate-Brand
    // header'ından okunmuş olabilir; varsa bilgilerini de döndür.
    if ctx.admin_user_id.is_none() {
        let impersonating_brand: Option<Value> =
            if let Some(imp) = ctx.impersonating_brand_id {
                sqlx::query_as::<_, (String, String)>(
                    "SELECT slug, display_name FROM brands WHERE id = $1",
                )
                .bind(imp)
                .fetch_optional(&state.db)
                .await?
                .map(|(slug, name)| {
                    json!({ "id": imp, "slug": slug, "display_name": name })
                })
            } else {
                None
            };

        return Ok(Json(json!({
            "success": true,
            "data": {
                "admin_user_id": null,
                "email": null,
                "display_name": state.config.admin_api_name,
                "role": "super_admin",
                "brand_id": null,
                "brand": null,
                "must_change_password": false,
                "password_changed_at": null,
                "impersonating_brand": impersonating_brand,
                // BUG-1 sonrası env-super da JWT taşır. UI hâlâ env-super'i
                // ayırt etmek için `admin_user_id === null` kontrolünü kullanır.
                "auth_method": "jwt",
            },
            "error": null,
        })));
    }
    let admin_user_id = ctx.admin_user_id.unwrap();

    let row: (String, String, String, Option<Uuid>, bool, bool, Option<chrono::DateTime<Utc>>) =
        sqlx::query_as(
            r#"
            SELECT email, display_name, role, brand_id, is_active,
                   must_change_password, password_changed_at
            FROM admin_users
            WHERE id = $1
            "#,
        )
        .bind(admin_user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::Unauthorized("user not found".to_string()))?;

    if !row.4 {
        return Err(AppError::Forbidden("Account is disabled".to_string()));
    }

    let brand: Option<Value> = if let Some(bid) = row.3 {
        sqlx::query_as::<_, (String, String)>(
            "SELECT slug, display_name FROM brands WHERE id = $1",
        )
        .bind(bid)
        .fetch_optional(&state.db)
        .await?
        .map(|(slug, name)| json!({ "id": bid, "slug": slug, "display_name": name }))
    } else {
        None
    };

    let impersonating_brand: Option<Value> = if let Some(imp) = ctx.impersonating_brand_id {
        sqlx::query_as::<_, (String, String)>(
            "SELECT slug, display_name FROM brands WHERE id = $1",
        )
        .bind(imp)
        .fetch_optional(&state.db)
        .await?
        .map(|(slug, name)| json!({ "id": imp, "slug": slug, "display_name": name }))
    } else {
        None
    };

    Ok(Json(json!({
        "success": true,
        "data": {
            "admin_user_id": admin_user_id,
            "email": row.0,
            "display_name": row.1,
            "role": row.2,
            "brand_id": row.3,
            "brand": brand,
            "must_change_password": row.5,
            "password_changed_at": row.6,
            "impersonating_brand": impersonating_brand,
            "auth_method": "jwt",
        },
        "error": null,
    })))
}

// ════════════════════════════════════════════════════════════════
// POST /api/admin/impersonate          (start act-as-brand mode)
// POST /api/admin/impersonate/stop     (exit act-as-brand mode)
// ════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct ImpersonateBody {
    brand_id: Uuid,
}

async fn impersonate_start(
    State(state): State<AppState>,
    ctx: AdminContext,
    Json(body): Json<ImpersonateBody>,
) -> Result<Json<Value>, AppError> {
    // Yalnızca env-super impersonate edebilir. brand_admin JWT'sinde
    // role != Super, dolayısıyla buraya geldiğinde 403 dönmeli.
    if ctx.role != AdminRole::Super {
        return Err(AppError::Forbidden("super_admin required".to_string()));
    }

    // Brand var ve aktif mi?
    let brand_row: Option<(bool, String, String)> = sqlx::query_as(
        "SELECT is_active, slug, display_name FROM brands WHERE id = $1",
    )
    .bind(body.brand_id)
    .fetch_optional(&state.db)
    .await?;
    let Some((active, slug, display_name)) = brand_row else {
        return Err(AppError::NotFound(format!(
            "brand {} not found",
            body.brand_id
        )));
    };
    if !active {
        return Err(AppError::BadRequest(
            "cannot impersonate inactive brand".to_string(),
        ));
    }

    // Audit log — actor env-super adı, impersonating brand kaydı zorunlu.
    let actor = format!(
        "env_super:{}",
        ctx.actor_name.as_deref().unwrap_or("super_admin")
    );
    let _ = sqlx::query(
        r#"
        INSERT INTO ad_audit_log
            (actor, action, target_kind, target_id, diff,
             admin_user_id, impersonating_brand_id, brand_id)
        VALUES ($1, 'impersonate_start', 'brand', $2, $3, NULL, $2, $2)
        "#,
    )
    .bind(&actor)
    .bind(body.brand_id)
    .bind(json!({ "brand_id": body.brand_id }))
    .execute(&state.db)
    .await;

    // Token mint etmiyoruz — frontend brand_id'yi localStorage'a yazıp
    // bundan sonraki tüm request'lerde `X-Impersonate-Brand` header'ı
    // ile gönderecek.
    Ok(Json(json!({
        "success": true,
        "data": {
            "impersonating_brand": {
                "id": body.brand_id,
                "slug": slug,
                "display_name": display_name,
            }
        },
        "error": null,
    })))
}

async fn impersonate_stop(
    State(state): State<AppState>,
    ctx: AdminContext,
) -> Result<Json<Value>, AppError> {
    if ctx.role != AdminRole::Super {
        return Err(AppError::Forbidden("super_admin required".to_string()));
    }
    let Some(brand_id) = ctx.impersonating_brand_id else {
        return Err(AppError::BadRequest(
            "not currently impersonating".to_string(),
        ));
    };

    let actor = format!(
        "env_super:{}",
        ctx.actor_name.as_deref().unwrap_or("super_admin")
    );
    let _ = sqlx::query(
        r#"
        INSERT INTO ad_audit_log
            (actor, action, target_kind, target_id, diff,
             admin_user_id, impersonating_brand_id, brand_id)
        VALUES ($1, 'impersonate_stop', 'brand', $2, '{}'::jsonb, NULL, NULL, $2)
        "#,
    )
    .bind(&actor)
    .bind(brand_id)
    .execute(&state.db)
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "ok": true },
        "error": null,
    })))
}
