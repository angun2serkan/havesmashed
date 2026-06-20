// CSRF double-submit token doğrulayıcısı (SEC-103).
//
// Çalışma prensibi:
//   * GET / HEAD / OPTIONS → safe, atla.
//   * Cookie'de `admin_csrf_token` veya `user_csrf_token` varsa →
//     `X-CSRF-Token` header'ı cookie değeri ile birebir eşleşmeli.
//   * Cookie yoksa (login öncesi, public endpoint) → atla. SameSite=Strict
//     cookie + auth katmanı zaten primary CSRF korumasını sağlıyor;
//     bu middleware defense-in-depth.
//
// Path-based seçim:
//   * `/api/admin/*`  → admin_csrf_token cookie
//   * Diğer `/api/*`  → user_csrf_token cookie
// Bu sayede dev'de localhost cookie jar'ı paylaştığında bile admin
// session'ı user CSRF cookie'siyle bypass edilemez.

use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderMap, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::services::csrf;

const ADMIN_CSRF_COOKIE: &str = "admin_csrf_token";
const USER_CSRF_COOKIE: &str = "user_csrf_token";
const CSRF_HEADER: &str = "x-csrf-token";

/// Auth bootstrap endpoint'leri — CSRF check'i atla. Gerekçe:
///   * login/register: henüz oturum yok; double-submit'in koruduğu state yok.
///     Body zaten secret içeriyor (seed phrase, invite token).
///   * logout / logout-all: kullanıcı state'i sıfırlamak istiyor; eski path'li
///     stale CSRF cookie'si (Path=/api migration'ı öncesi) yüzünden takılı
///     kalan kullanıcının çıkış yapabilmesi şart.
///   * admin login/refresh/logout: aynı gerekçe admin tarafında.
/// Bu endpoint'ler SameSite=Strict access cookie ile zaten cross-site CSRF'e
/// karşı korunuyor; double-submit defense-in-depth kaybı sınırlı ve geçici.
const CSRF_SKIP_PATHS: &[&str] = &[
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/logout",
    "/api/auth/logout-all",
    "/api/admin/auth/login",
    "/api/admin/auth/refresh",
    "/api/admin/auth/logout",
];

pub async fn csrf_protect(request: Request, next: Next) -> Response {
    // Safe methods bypass — RFC 7231 idempotent.
    if matches!(
        request.method(),
        &Method::GET | &Method::HEAD | &Method::OPTIONS
    ) {
        return next.run(request).await;
    }

    let path = request.uri().path();

    if CSRF_SKIP_PATHS.contains(&path) {
        return next.run(request).await;
    }

    // Path'e göre hangi cookie aranacağına karar ver. /api/admin/...
    // tüm admin endpoint'lerini kapsar (login dahil — onlar zaten cookie
    // yoksa skip yolundan geçer).
    let expected_cookie = if path.starts_with("/api/admin") {
        ADMIN_CSRF_COOKIE
    } else {
        USER_CSRF_COOKIE
    };

    let cookie_token = read_cookie(request.headers(), expected_cookie);

    // Cookie yoksa: kullanıcı henüz login olmamış (login/register endpoint'i)
    // veya endpoint public. Skip — session yoksa CSRF saldırısının hedefi yok.
    let Some(cookie_value) = cookie_token else {
        return next.run(request).await;
    };

    // Cookie varsa header zorunlu; eşleşmiyorsa 403.
    let header_value = request
        .headers()
        .get(CSRF_HEADER)
        .and_then(|v| v.to_str().ok());

    match header_value {
        Some(h) if csrf::constant_time_eq(&cookie_value, h) => next.run(request).await,
        _ => forbidden_response(),
    }
}

fn read_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
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

fn forbidden_response() -> Response {
    (
        StatusCode::FORBIDDEN,
        axum::Json(json!({
            "success": false,
            "data": null,
            "error": "csrf_token_mismatch",
        })),
    )
        .into_response()
}

// Body parametresi cargo'nun unused import uyarısı vermemesi için
// burada explicit referans alıyoruz. (axum::body::Body, Next imza için
// gerekli ama doğrudan kullanılmıyor.)
#[allow(dead_code)]
fn _body_type_anchor(_b: Body) {}
