// Affiliate redirector + admin CRUD.
//
// Public side: GET /go/:slug → 302 redirect to the brand's target URL
// with UTM params injected and Referrer-Policy set to no-referrer so
// the brand can't see which haveismash page sent the user. Click
// counts are bumped per slug per day in `affiliate_clicks` — no user
// identity is recorded.
//
// Admin side: full CRUD on `affiliate_links`. Soft-delete only
// (is_active=false) so historical click counts remain interpretable.
// Every mutation writes to `ad_audit_log` via admin_ads::audit.

use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::handlers::admin_brands::write_audit;
use crate::middleware::admin_context::{AdminContext, AdminRole};
use crate::AppState;

// ── Routers ───────────────────────────────────────────────────

/// Public router — mount at root level (NOT under /api).
pub fn public_router() -> Router<AppState> {
    Router::new().route("/go/{slug}", get(redirect_slug))
}

/// Admin router — merged into the /api/admin/ads scope.
pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/affiliate", get(list_affiliate).post(create_affiliate))
        .route(
            "/affiliate/{id}",
            post(update_affiliate)
                .put(update_affiliate)
                .delete(deactivate_affiliate),
        )
        .route("/affiliate/{id}/restore", post(restore_affiliate))
}

// ── Validation ────────────────────────────────────────────────

fn valid_slug(s: &str) -> bool {
    // Mirrors the DB CHECK: ^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$
    let len = s.len();
    if !(3..=40).contains(&len) {
        return false;
    }
    let bytes = s.as_bytes();
    let alnum = |b: u8| b.is_ascii_lowercase() || b.is_ascii_digit();
    if !alnum(bytes[0]) || !alnum(bytes[len - 1]) {
        return false;
    }
    bytes[1..len - 1]
        .iter()
        .all(|&b| alnum(b) || b == b'-')
}

fn valid_utm(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 80
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
}

fn valid_target_url(s: &str) -> bool {
    (s.starts_with("https://") || s.starts_with("http://"))
        && !s.contains(' ')
        && !s.contains('\n')
        && s.len() <= 2048
}

// ── Public redirector ─────────────────────────────────────────

async fn redirect_slug(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Response, AppError> {
    if !valid_slug(&slug) {
        return Err(AppError::NotFound("slug".to_string()));
    }

    use sqlx::Row;
    let row = sqlx::query(
        r#"
        SELECT target_url, utm_campaign
        FROM affiliate_links
        WHERE slug = $1 AND is_active = TRUE
        "#,
    )
    .bind(&slug)
    .fetch_optional(&state.db)
    .await?;

    let Some(row) = row else {
        return Err(AppError::NotFound("affiliate link not found".to_string()));
    };

    let target_url: String = row.get("target_url");
    let utm_campaign: Option<String> = row.get("utm_campaign");

    let final_url = inject_utm(&target_url, utm_campaign.as_deref());

    // Bump the per-day counter. Failure here is logged but doesn't
    // block the redirect — losing one click is preferable to making
    // the user wait for an error page.
    if let Err(e) = sqlx::query(
        r#"
        INSERT INTO affiliate_clicks (slug, date, count)
        VALUES ($1, CURRENT_DATE, 1)
        ON CONFLICT (slug, date) DO UPDATE SET count = affiliate_clicks.count + 1
        "#,
    )
    .bind(&slug)
    .execute(&state.db)
    .await
    {
        tracing::warn!("affiliate click increment failed for {slug}: {e}");
    }

    let mut headers = HeaderMap::new();
    headers.insert(
        header::LOCATION,
        HeaderValue::from_str(&final_url).map_err(|_| {
            AppError::Internal("invalid redirect URL".to_string())
        })?,
    );
    // Strip referer end-to-end so the brand can't fingerprint origin pages.
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    // No caching so admin edits to target_url take effect immediately
    // and click counts stay accurate.
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );

    Ok((StatusCode::FOUND, headers).into_response())
}

fn inject_utm(target_url: &str, utm_campaign: Option<&str>) -> String {
    // Strip fragment, append UTM, then re-attach. UTM stays on the
    // server side of the URL so it survives single-page-app rewrites.
    let (base, fragment) = match target_url.split_once('#') {
        Some((b, f)) => (b.to_string(), Some(f.to_string())),
        None => (target_url.to_string(), None),
    };

    let separator = if base.contains('?') { '&' } else { '?' };

    let mut out = format!(
        "{base}{separator}utm_source=haveismash&utm_medium=affiliate"
    );
    if let Some(camp) = utm_campaign {
        if !camp.is_empty() {
            // utm_campaign is validated to be alnum + - _ . — safe to
            // append without percent-encoding.
            out.push_str("&utm_campaign=");
            out.push_str(camp);
        }
    }
    if let Some(f) = fragment {
        out.push('#');
        out.push_str(&f);
    }
    out
}

// ── Admin CRUD ────────────────────────────────────────────────
// All admin endpoints take `AdminContext` (JWT Bearer only).
// Env-super JWT (claims.sub = Uuid::nil() sentinel) tanınır; eski
// x-admin-key header path'i BUG-1 fix ile kaldırıldı.

#[derive(Serialize)]
struct DailyClick {
    date: chrono::NaiveDate,
    count: i64,
}

#[derive(Serialize)]
struct AffiliateRow {
    id: Uuid,
    slug: String,
    /// Operatör-okur etiket. NULL ise UI slug'a fallback yapar.
    name: Option<String>,
    brand_id: Option<Uuid>,
    brand_name: String,
    target_url: String,
    utm_campaign: Option<String>,
    is_active: bool,
    deleted_at: Option<chrono::DateTime<chrono::Utc>>,
    notes: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Last 30 days of clicks summed (rolling).
    clicks_30d: i64,
    /// All-time clicks since slug creation.
    clicks_total: i64,
    /// Per-day click counts for the last 30 days, oldest first. Days
    /// with no clicks are filled with 0 so the sparkline renders a
    /// continuous line.
    daily_clicks: Vec<DailyClick>,
}

#[derive(Deserialize)]
struct ListAffiliateQuery {
    /// Super-only: include soft-deleted tombstones.
    include_deleted: Option<bool>,
}

async fn list_affiliate(
    State(state): State<AppState>,
    ctx: AdminContext,
    axum::extract::Query(q): axum::extract::Query<ListAffiliateQuery>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let include_deleted =
        q.include_deleted.unwrap_or(false) && ctx.effective_role() == AdminRole::Super;
    let scope = ctx.brand_scope();

    let deleted_clause = if include_deleted {
        ""
    } else {
        "AND l.deleted_at IS NULL"
    };

    let sql = format!(
        r#"
        SELECT
            l.id,
            l.slug,
            l.name,
            l.brand_id,
            l.brand_name,
            l.target_url,
            l.utm_campaign,
            l.is_active,
            l.deleted_at,
            l.notes,
            l.created_at,
            l.updated_at,
            COALESCE((
                SELECT SUM(count) FROM affiliate_clicks c
                WHERE c.slug = l.slug AND c.date >= CURRENT_DATE - 30
            ), 0)::bigint AS clicks_30d,
            COALESCE((
                SELECT SUM(count) FROM affiliate_clicks c
                WHERE c.slug = l.slug
            ), 0)::bigint AS clicks_total
        FROM affiliate_links l
        WHERE ($1::uuid IS NULL OR l.brand_id = $1)
          {deleted_clause}
        ORDER BY l.is_active DESC, l.created_at DESC
        "#
    );

    let rows = sqlx::query_as::<_, (
        Uuid,
        String,
        Option<String>,
        Option<Uuid>,
        String,
        String,
        Option<String>,
        bool,
        Option<chrono::DateTime<chrono::Utc>>,
        Option<String>,
        chrono::DateTime<chrono::Utc>,
        Option<chrono::DateTime<chrono::Utc>>,
        Option<i64>,
        Option<i64>,
    )>(&sql)
    .bind(scope)
    .fetch_all(&state.db)
    .await?;

    // Pull last 30d per-day clicks for all slugs in one query, group
    // in Rust. Cheaper than N+1 sub-selects when the slug list grows.
    let click_rows = sqlx::query_as::<_, (String, chrono::NaiveDate, i32)>(
        r#"
        SELECT slug, date, count
        FROM affiliate_clicks
        WHERE date >= CURRENT_DATE - 29
        ORDER BY slug, date
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    let mut clicks_by_slug: std::collections::HashMap<String, std::collections::HashMap<chrono::NaiveDate, i64>> =
        std::collections::HashMap::new();
    for (slug, date, count) in click_rows {
        clicks_by_slug
            .entry(slug)
            .or_default()
            .insert(date, count as i64);
    }

    let today = chrono::Utc::now().date_naive();
    let window: Vec<chrono::NaiveDate> = (0..30)
        .rev()
        .map(|offset| today - chrono::Duration::days(offset))
        .collect();

    let rows: Vec<AffiliateRow> = rows
        .into_iter()
        .map(|r| {
            let per_day = clicks_by_slug.get(&r.1);
            let daily_clicks = window
                .iter()
                .map(|d| DailyClick {
                    date: *d,
                    count: per_day.and_then(|m| m.get(d)).copied().unwrap_or(0),
                })
                .collect();
            AffiliateRow {
                id: r.0,
                slug: r.1,
                name: r.2,
                brand_id: r.3,
                brand_name: r.4,
                target_url: r.5,
                utm_campaign: r.6,
                is_active: r.7,
                deleted_at: r.8,
                notes: r.9,
                created_at: r.10,
                updated_at: r.11,
                clicks_30d: r.12.unwrap_or(0),
                clicks_total: r.13.unwrap_or(0),
                daily_clicks,
            }
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": rows, "error": null })))
}

#[derive(Deserialize)]
struct CreateAffiliateBody {
    slug: String,
    /// Required when calling as super_admin without a brand context.
    /// For brand_admin (or super impersonating), server forces to scope.
    brand_id: Option<Uuid>,
    /// Operatör-okur etiket (1..=80). Boş veya yoksa NULL kaydedilir;
    /// UI bu durumda slug'ı gösterir.
    name: Option<String>,
    target_url: String,
    utm_campaign: Option<String>,
    notes: Option<String>,
}

async fn create_affiliate(
    State(state): State<AppState>,
    ctx: AdminContext,
    Json(body): Json<CreateAffiliateBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let slug = body.slug.trim().to_lowercase();
    if !valid_slug(&slug) {
        return Err(AppError::BadRequest(
            "slug must be 3-40 chars, lowercase alphanumeric and dashes, edges alphanumeric"
                .to_string(),
        ));
    }
    let target_url = body.target_url.trim();
    if !valid_target_url(target_url) {
        return Err(AppError::BadRequest(
            "target_url must be http(s) and ≤2048 chars".to_string(),
        ));
    }
    let utm_campaign = body.utm_campaign.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if let Some(c) = utm_campaign {
        if !valid_utm(c) {
            return Err(AppError::BadRequest(
                "utm_campaign must be alnum/dash/underscore/dot, ≤80 chars".to_string(),
            ));
        }
    }
    let name = body.name.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if let Some(n) = name {
        if n.chars().count() > 80 {
            return Err(AppError::BadRequest(
                "name must be 1..=80 chars".to_string(),
            ));
        }
    }

    // Brand resolution: brand_admin / impersonating super → forced to
    // their scope; super_admin must provide brand_id explicitly.
    let effective_brand_id: Option<Uuid> = match ctx.brand_scope() {
        Some(b) => Some(b),
        None => body.brand_id,
    };

    // Look up brand_name as denormalized cache; allow NULL brand for
    // organic partner links super_admin creates without entity.
    let brand_name: String = match effective_brand_id {
        Some(bid) => sqlx::query_scalar(
            "SELECT display_name FROM brands WHERE id = $1 AND is_active = TRUE",
        )
        .bind(bid)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("brand {bid} not found or inactive")))?,
        None => "organic".to_string(),
    };

    let id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO affiliate_links (slug, brand_id, brand_name, target_url, utm_campaign, notes, name)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        "#,
    )
    .bind(&slug)
    .bind(effective_brand_id)
    .bind(&brand_name)
    .bind(target_url)
    .bind(utm_campaign)
    .bind(body.notes.as_deref())
    .bind(name)
    .fetch_one(&state.db)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(ref db_err) if db_err.is_unique_violation() => {
            AppError::Conflict(format!("slug '{slug}' already exists"))
        }
        other => AppError::Sqlx(other),
    })?;

    let after = fetch_affiliate(&state.db, id).await?;
    write_audit(
        &state.db,
        &ctx,
        "affiliate_create",
        Some("affiliate"),
        Some(id),
        effective_brand_id,
        Some(json!({ "after": after })),
    )
    .await;

    Ok(Json(json!({ "success": true, "data": after, "error": null })))
}

#[derive(Deserialize)]
struct UpdateAffiliateBody {
    target_url: Option<String>,
    utm_campaign: Option<Option<String>>, // double Option = explicit null clears
    notes: Option<Option<String>>,
    is_active: Option<bool>,
    /// Three-state: absent → değişmez, null → temizle, value → set.
    name: Option<Option<String>>,
}

async fn update_affiliate(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateAffiliateBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let target_brand_id = fetch_affiliate_brand(&state.db, id).await?;
    if let Some(bid) = target_brand_id {
        ctx.require_brand_scope(bid)?;
    } else {
        // Brand-less (organic) affiliate links — super only.
        ctx.require_super()?;
    }

    let before = fetch_affiliate(&state.db, id).await?;

    if let Some(ref url) = body.target_url {
        if !valid_target_url(url.trim()) {
            return Err(AppError::BadRequest(
                "target_url must be http(s) and ≤2048 chars".to_string(),
            ));
        }
    }
    if let Some(Some(ref camp)) = body.utm_campaign {
        if !camp.is_empty() && !valid_utm(camp) {
            return Err(AppError::BadRequest(
                "utm_campaign must be alnum/dash/underscore/dot, ≤80 chars".to_string(),
            ));
        }
    }
    if let Some(Some(ref n)) = body.name {
        let trimmed = n.trim();
        if !trimmed.is_empty() && trimmed.chars().count() > 80 {
            return Err(AppError::BadRequest(
                "name must be 1..=80 chars".to_string(),
            ));
        }
    }

    let utm_set = body.utm_campaign.is_some();
    let utm_value = body
        .utm_campaign
        .clone()
        .flatten()
        .filter(|s| !s.is_empty());
    let notes_set = body.notes.is_some();
    let notes_value = body.notes.clone().flatten();
    let name_set = body.name.is_some();
    let name_value = body
        .name
        .as_ref()
        .and_then(|opt| opt.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(String::from));

    let result = sqlx::query(
        r#"
        UPDATE affiliate_links SET
            target_url   = COALESCE($2, target_url),
            utm_campaign = CASE WHEN $3::boolean THEN $4 ELSE utm_campaign END,
            notes        = CASE WHEN $5::boolean THEN $6 ELSE notes END,
            is_active    = COALESCE($7, is_active),
            name         = CASE WHEN $8::boolean THEN $9 ELSE name END,
            updated_at   = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .bind(body.target_url.as_deref().map(str::trim))
    .bind(utm_set)
    .bind(utm_value)
    .bind(notes_set)
    .bind(notes_value)
    .bind(body.is_active)
    .bind(name_set)
    .bind(name_value)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("affiliate link not found".to_string()));
    }

    let after = fetch_affiliate(&state.db, id).await?;
    write_audit(
        &state.db,
        &ctx,
        "affiliate_update",
        Some("affiliate"),
        Some(id),
        target_brand_id,
        Some(json!({ "before": before, "after": after })),
    )
    .await;

    Ok(Json(json!({ "success": true, "data": after, "error": null })))
}

async fn deactivate_affiliate(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let target_brand_id = fetch_affiliate_brand(&state.db, id).await?;
    if let Some(bid) = target_brand_id {
        ctx.require_brand_scope(bid)?;
    } else {
        ctx.require_super()?;
    }

    let before = fetch_affiliate(&state.db, id).await?;

    // T0.2 — soft delete via deleted_at, also clear is_active so the
    // redirector double-guards against serving the link.
    let result = sqlx::query(
        r#"
        UPDATE affiliate_links
        SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        // Already deleted — idempotent
        return Ok(Json(json!({
            "success": true,
            "data": { "id": id, "deleted": true, "idempotent": true },
            "error": null
        })));
    }

    write_audit(
        &state.db,
        &ctx,
        "affiliate_delete",
        Some("affiliate"),
        Some(id),
        target_brand_id,
        Some(json!({ "before": before })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "deleted": true },
        "error": null
    })))
}

async fn restore_affiliate(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let target_brand_id = sqlx::query_scalar::<_, Option<Uuid>>(
        "SELECT brand_id FROM affiliate_links WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("affiliate link not found".to_string()))?;

    let res = sqlx::query(
        r#"
        UPDATE affiliate_links
        SET deleted_at = NULL, is_active = TRUE, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NOT NULL
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::BadRequest(
            "affiliate link is not deleted".to_string(),
        ));
    }

    write_audit(
        &state.db,
        &ctx,
        "affiliate_restore",
        Some("affiliate"),
        Some(id),
        target_brand_id,
        Some(json!({ "restored": true })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "restored": true },
        "error": null
    })))
}

async fn fetch_affiliate_brand(db: &PgPool, id: Uuid) -> Result<Option<Uuid>, AppError> {
    sqlx::query_scalar::<_, Option<Uuid>>(
        "SELECT brand_id FROM affiliate_links WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("affiliate link not found".to_string()))
}

async fn fetch_affiliate(db: &PgPool, id: Uuid) -> Result<Value, AppError> {
    use sqlx::Row;
    let row = sqlx::query(
        r#"
        SELECT id, slug, name, brand_name, target_url, utm_campaign,
               is_active, notes, created_at, updated_at
        FROM affiliate_links WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("affiliate link not found".to_string()))?;

    Ok(json!({
        "id": row.get::<Uuid, _>("id"),
        "slug": row.get::<String, _>("slug"),
        "name": row.get::<Option<String>, _>("name"),
        "brand_name": row.get::<String, _>("brand_name"),
        "target_url": row.get::<String, _>("target_url"),
        "utm_campaign": row.get::<Option<String>, _>("utm_campaign"),
        "is_active": row.get::<bool, _>("is_active"),
        "notes": row.get::<Option<String>, _>("notes"),
        "created_at": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
        "updated_at": row.get::<Option<chrono::DateTime<chrono::Utc>>, _>("updated_at"),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_validation() {
        assert!(valid_slug("durex-promo"));
        assert!(valid_slug("a1b"));
        assert!(valid_slug("trojan-q1-2026"));
        assert!(!valid_slug("ab"));
        assert!(!valid_slug("-bad"));
        assert!(!valid_slug("bad-"));
        assert!(!valid_slug("Has-Caps"));
        assert!(!valid_slug("with space"));
        assert!(!valid_slug(""));
    }

    #[test]
    fn utm_validation() {
        assert!(valid_utm("q1-2026"));
        assert!(valid_utm("haveismash.summer"));
        assert!(!valid_utm(""));
        assert!(!valid_utm("with space"));
        assert!(!valid_utm("bad/char"));
    }

    #[test]
    fn target_url_validation() {
        assert!(valid_target_url("https://durex.com/promo"));
        assert!(valid_target_url("http://example.com"));
        assert!(!valid_target_url("ftp://nope.com"));
        assert!(!valid_target_url("javascript:alert(1)"));
        assert!(!valid_target_url("https://has space.com"));
    }

    #[test]
    fn utm_injection_basic() {
        let out = inject_utm("https://durex.com/promo", Some("q1-2026"));
        assert_eq!(
            out,
            "https://durex.com/promo?utm_source=haveismash&utm_medium=affiliate&utm_campaign=q1-2026"
        );
    }

    #[test]
    fn utm_injection_existing_query() {
        let out = inject_utm("https://durex.com/promo?ref=x", Some("q1"));
        assert_eq!(
            out,
            "https://durex.com/promo?ref=x&utm_source=haveismash&utm_medium=affiliate&utm_campaign=q1"
        );
    }

    #[test]
    fn utm_injection_with_fragment() {
        let out = inject_utm("https://durex.com/promo#section", Some("q1"));
        assert_eq!(
            out,
            "https://durex.com/promo?utm_source=haveismash&utm_medium=affiliate&utm_campaign=q1#section"
        );
    }

    #[test]
    fn utm_injection_no_campaign() {
        let out = inject_utm("https://durex.com/promo", None);
        assert_eq!(
            out,
            "https://durex.com/promo?utm_source=haveismash&utm_medium=affiliate"
        );
    }
}
