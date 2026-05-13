// Brand isolation invariants — the kritik güvenlik testleri.
//
// Tests aren't full integration tests (no axum server boot) — they
// exercise AdminContext authorization helpers directly. The pattern
// is intentional: the heavy lifting in admin_ads/admin_brands etc.
// goes through these three methods (require_super,
// require_brand_scope, brand_scope) and require_password_changed.
// If those are correct, the SQL filters are correct by construction
// since each call site binds ctx.brand_scope() to the query.
//
// End-to-end HTTP-level tests are deferred to Faz 5 pilot (T5.4).

use havesmashed_backend::error::AppError;
use havesmashed_backend::middleware::admin_context::{AdminContext, AdminRole};
use uuid::Uuid;

fn super_ctx() -> AdminContext {
    AdminContext {
        admin_user_id: Some(Uuid::new_v4()),
        role: AdminRole::Super,
        brand_id: None,
        impersonating_brand_id: None,
        password_change_required: false,
    }
}

fn brand_ctx(brand_id: Uuid) -> AdminContext {
    AdminContext {
        admin_user_id: Some(Uuid::new_v4()),
        role: AdminRole::Brand,
        brand_id: Some(brand_id),
        impersonating_brand_id: None,
        password_change_required: false,
    }
}

fn impersonating_super(target_brand: Uuid) -> AdminContext {
    AdminContext {
        admin_user_id: Some(Uuid::new_v4()),
        role: AdminRole::Super,
        brand_id: None,
        impersonating_brand_id: Some(target_brand),
        password_change_required: false,
    }
}

fn legacy_api_key_ctx() -> AdminContext {
    AdminContext {
        admin_user_id: None,
        role: AdminRole::Super,
        brand_id: None,
        impersonating_brand_id: None,
        password_change_required: false,
    }
}

fn pwc_ctx(brand_id: Uuid) -> AdminContext {
    AdminContext {
        admin_user_id: Some(Uuid::new_v4()),
        role: AdminRole::Brand,
        brand_id: Some(brand_id),
        impersonating_brand_id: None,
        password_change_required: true,
    }
}

fn is_forbidden<T>(r: &Result<T, AppError>) -> bool {
    matches!(r, Err(AppError::Forbidden(_)))
}

// ── T2.9 #1: brand_admin A cannot read brand_admin B's campaign ─

#[test]
fn brand_admin_blocked_from_other_brand() {
    let brand_a = Uuid::new_v4();
    let brand_b = Uuid::new_v4();
    let ctx = brand_ctx(brand_a);
    assert!(is_forbidden(&ctx.require_brand_scope(brand_b)));
    assert!(ctx.require_brand_scope(brand_a).is_ok());
}

// ── T2.9 #3-#6: brand_admin blocked from super-only endpoints ──

#[test]
fn brand_admin_blocked_from_super_endpoints() {
    let ctx = brand_ctx(Uuid::new_v4());
    assert!(is_forbidden(&ctx.require_super()));
}

// ── Super sees all brands ──

#[test]
fn super_admin_sees_all_brands() {
    let ctx = super_ctx();
    assert_eq!(ctx.brand_scope(), None);
    assert!(ctx.require_brand_scope(Uuid::new_v4()).is_ok());
    assert!(ctx.require_super().is_ok());
}

// ── T2.9 #8: super_admin impersonating B is scope-narrowed ──

#[test]
fn impersonating_super_is_scope_locked() {
    let brand_a = Uuid::new_v4();
    let brand_b = Uuid::new_v4();
    let ctx = impersonating_super(brand_a);

    // Sees scope of impersonated brand
    assert_eq!(ctx.brand_scope(), Some(brand_a));
    // Now behaves like a brand_admin: own brand OK
    assert!(ctx.require_brand_scope(brand_a).is_ok());
    // Other brand: forbidden
    assert!(is_forbidden(&ctx.require_brand_scope(brand_b)));
    // Super-only gates also closed while impersonating
    assert!(is_forbidden(&ctx.require_super()));
}

// ── Legacy ADMIN_API_KEY path is effectively super ──

#[test]
fn legacy_api_key_acts_as_super() {
    let ctx = legacy_api_key_ctx();
    assert!(ctx.admin_user_id.is_none());
    assert!(ctx.require_super().is_ok());
    assert_eq!(ctx.brand_scope(), None);
    assert!(ctx.require_brand_scope(Uuid::new_v4()).is_ok());
}

// ── T0.3: pwc=true blocks every endpoint except change-password ──

#[test]
fn pwc_blocks_normal_endpoints() {
    let ctx = pwc_ctx(Uuid::new_v4());
    assert!(is_forbidden(&ctx.require_password_changed()));
}

#[test]
fn no_pwc_allows_normal_endpoints() {
    let ctx = brand_ctx(Uuid::new_v4());
    assert!(ctx.require_password_changed().is_ok());
}

// ── Role inference helpers ──

#[test]
fn effective_role_super_no_impersonation() {
    let ctx = super_ctx();
    assert_eq!(ctx.effective_role(), AdminRole::Super);
}

#[test]
fn effective_role_super_impersonating_is_brand() {
    let ctx = impersonating_super(Uuid::new_v4());
    assert_eq!(ctx.effective_role(), AdminRole::Brand);
}

#[test]
fn effective_role_brand() {
    let ctx = brand_ctx(Uuid::new_v4());
    assert_eq!(ctx.effective_role(), AdminRole::Brand);
}

// ── brand_scope() contract ──

#[test]
fn brand_scope_super_returns_none() {
    assert_eq!(super_ctx().brand_scope(), None);
}

#[test]
fn brand_scope_brand_returns_own_id() {
    let id = Uuid::new_v4();
    assert_eq!(brand_ctx(id).brand_scope(), Some(id));
}

#[test]
fn brand_scope_impersonation_returns_target() {
    let target = Uuid::new_v4();
    assert_eq!(impersonating_super(target).brand_scope(), Some(target));
}
