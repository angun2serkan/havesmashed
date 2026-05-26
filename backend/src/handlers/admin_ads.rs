// Admin endpoints for ad inventory: placements, campaigns, creative upload.
//
// AUTH MODEL:
//   * Every endpoint extracts `AdminContext` (JWT Bearer only).
//     Env-super JWT taşır: claims.sub = Uuid::nil() sentinel +
//     role=super_admin. Eski x-admin-key header path'i BUG-1 fix
//     ile kaldırıldı — bk. middleware/admin_context.rs.
//   * Brand-scoped query pattern:
//       WHERE ($1::uuid IS NULL OR brand_id = $1) AND deleted_at IS NULL
//     bound to ctx.brand_scope(). Super sees all; brand_admin (and
//     super-impersonating) is filtered automatically.
//
// T0.2 (soft delete):
//   * DELETE /campaigns/:id sets deleted_at + status='paused'. Open
//     to brand_admin for own brand; super_admin always.
//   * POST /campaigns/:id/restore (super only) clears deleted_at and
//     restores status from audit log "before" snapshot.
//   * Listing default filters out deleted; super may pass
//     ?include_deleted=true to see tombstones.
//
// T0.4 (budget gating):
//   * pricing_model / unit_price_cents / total_budget_cents are write-
//     restricted to super_admin even on brand-owned campaigns. Brand
//     PATCH body fields for these are silently dropped.
//   * GET response includes spent_cents and progress_percent.
//   * The 5-minute budget aggregator cron (services/budget_aggregator.rs)
//     bumps spent_cents and auto-pauses at 100%.
//
// Anonymity contract: nothing here reads, writes, or returns
// user-tied data. Aggregate metrics come from ad_metrics /
// ad_placement_metrics which are anonymous by design.

use axum::extract::{DefaultBodyLimit, Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::handlers::admin_brands::write_audit;
use crate::middleware::admin_context::{AdminContext, AdminRole};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Placements
        .route("/placements", get(list_placements))
        .route("/placements/{key}", get(get_placement).put(update_placement))
        .route("/placements/{key}/detail", get(get_placement_detail))
        .route("/placements/{key}/enable", post(enable_placement))
        .route("/placements/{key}/disable", post(disable_placement))
        // Campaigns
        .route("/campaigns", get(list_campaigns).post(create_campaign))
        // T3.4 — static path before /campaigns/{id} to avoid uuid parse
        .route("/campaigns/pending-review", get(list_pending_review))
        .route(
            "/campaigns/{id}",
            get(get_campaign).put(update_campaign).delete(delete_campaign),
        )
        .route("/campaigns/{id}/detail", get(get_campaign_detail))
        .route("/campaigns/{id}/badge", get(get_campaign_badge))
        .route("/campaigns/{id}/pause", post(pause_campaign))
        .route("/campaigns/{id}/activate", post(activate_campaign))
        .route("/campaigns/{id}/restore", post(restore_campaign))
        // T3.3 — approval state machine
        .route("/campaigns/{id}/submit-for-review", post(submit_for_review))
        .route("/campaigns/{id}/approve", post(approve_campaign))
        .route("/campaigns/{id}/reject", post(reject_campaign))
        .route("/campaigns/{id}/resume", post(resume_campaign))
        // Campaign extension (target + ends_at) — wallet flow
        .route("/campaigns/{id}/extend", post(extend_campaign))
        // Audit log
        .route("/audit", get(list_audit_log))
        // Creative upload — gövde limiti video için 50MB'a yükseltildi
        // (Axum default 2MB). MIME ve dosya boyutu detayı
        // upload_creative içinde tekrar doğrulanır.
        .route(
            "/upload-creative",
            post(upload_creative).layer(DefaultBodyLimit::max(60 * 1024 * 1024)),
        )
}

// ── Audit log helper (kept for cross-module reuse) ────────────
//
// Older callers still hit admin_ads::audit(); new code should call
// admin_brands::write_audit with the full AdminContext. This shim
// preserves the simpler signature and tags the actor as 'legacy'.

pub async fn audit(
    db: &PgPool,
    action: &str,
    target_kind: Option<&str>,
    target_id: Option<Uuid>,
    diff: Option<Value>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO ad_audit_log (actor, action, target_id, target_kind, diff)
        VALUES ('admin', $1, $2, $3, $4)
        "#,
    )
    .bind(action)
    .bind(target_id)
    .bind(target_kind)
    .bind(diff)
    .execute(db)
    .await?;
    Ok(())
}

// ── Creative validation ───────────────────────────────────────

fn validate_creative(spec: &Value, creative: &Value) -> Result<(), AppError> {
    let Some(spec_obj) = spec.as_object() else {
        return Err(AppError::Internal("creative_spec malformed".to_string()));
    };
    let Some(creative_obj) = creative.as_object() else {
        return Err(AppError::BadRequest(
            "creative must be a JSON object".to_string(),
        ));
    };

    for (spec_key, spec_value) in spec_obj {
        if let Some(field) = spec_key.strip_suffix("_max") {
            let Some(max) = spec_value.as_u64() else {
                continue;
            };
            if let Some(actual) = creative_obj.get(field).and_then(|v| v.as_str()) {
                let len = actual.chars().count() as u64;
                if len > max {
                    return Err(AppError::BadRequest(format!(
                        "creative.{field} exceeds max length {max} (got {len})"
                    )));
                }
            }
        }
        // Spec'te `image_size` / `logo_size` vb. bir görsel beklendiğini
        // söylüyorsa karşılığı `image_url` / `logo_url` zorunlu. UI tarafı
        // bunu zorluyor; backend de defense-in-depth olarak doğrular,
        // böylece image_url'siz creative DB'ye düşmez.
        // `_size_optional` suffix'i ise alanı tanımlar (UI yine yükleme
        // kutusu çıkarır) ama zorunluluk koymaz.
        if spec_key.ends_with("_size_optional") {
            continue;
        }
        if let Some(base) = spec_key.strip_suffix("_size") {
            let url_field = format!("{base}_url");
            let url_set = creative_obj
                .get(&url_field)
                .and_then(|v| v.as_str())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);
            if !url_set {
                return Err(AppError::BadRequest(format!(
                    "creative.{url_field} zorunlu — bu placement için görsel gerekli"
                )));
            }
        }
    }
    Ok(())
}

// ── Badge spec validation (placement_key='badge_sponsor') ─────

fn validate_badge_spec(spec: &BadgeSpec) -> Result<(), AppError> {
    let name = spec.name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::BadRequest(
            "badge name must be 1..=100 chars".to_string(),
        ));
    }
    let desc = spec.description.trim();
    if desc.is_empty() || desc.chars().count() > 255 {
        return Err(AppError::BadRequest(
            "badge description must be 1..=255 chars".to_string(),
        ));
    }
    let icon = spec.icon.trim();
    if icon.is_empty() || icon.chars().count() > 10 {
        return Err(AppError::BadRequest(
            "badge icon must be 1..=10 chars (emoji)".to_string(),
        ));
    }
    if !matches!(spec.category.as_str(), "dates" | "explore" | "social" | "quality") {
        return Err(AppError::BadRequest(
            "badge category must be one of: dates, explore, social, quality"
                .to_string(),
        ));
    }
    if spec.threshold < 1 {
        return Err(AppError::BadRequest(
            "badge threshold must be >= 1".to_string(),
        ));
    }
    if let Some(g) = &spec.gender {
        if !matches!(g.as_str(), "male" | "female" | "both") {
            return Err(AppError::BadRequest(
                "badge gender must be one of: male, female, both".to_string(),
            ));
        }
    }
    if let Some(c) = &spec.criteria {
        crate::services::badge_criteria::validate_criteria(c)
            .map_err(|e| AppError::BadRequest(format!("badge criteria: {e}")))?;
    }
    Ok(())
}

/// 23505 unique violation'ı kullanıcıya gösterilebilir mesaja çevirir.
/// Brand badge'leri için üç unique scope var:
///   - badges_name_key                              → globally unique badge name
///   - idx_brand_badges_description_lower           → brand badge description (case-insensitive)
///   - idx_badge_sponsor_campaigns_click_url_lower  → badge_sponsor kampanyalarında click_url (case-insensitive)
fn map_badge_unique_violation(e: sqlx::Error) -> AppError {
    if let sqlx::Error::Database(db_err) = &e {
        if db_err.code().as_deref() == Some("23505") {
            let constraint = db_err.constraint().unwrap_or("");
            let msg = match constraint {
                "badges_name_key" => "Bu isimde bir badge zaten mevcut, farklı bir isim seçin",
                "idx_brand_badges_description_lower" => {
                    "Bu açıklamayla bir badge zaten mevcut, farklı bir açıklama yazın"
                }
                "idx_badge_sponsor_campaigns_click_url_lower" => {
                    "Bu yönlendirme linkiyle bir badge_sponsor kampanyası zaten mevcut, farklı bir link kullanın"
                }
                _ => "Badge alanı çakışıyor, farklı değerler deneyin",
            };
            return AppError::Conflict(msg.to_string());
        }
    }
    AppError::Sqlx(e)
}

/// Brand badge'inin status'ünü kampanyanın status'üne eşitler.
/// placement_key='badge_sponsor' olmayan kampanyalarda no-op (badges.campaign_id NULL).
async fn sync_badge_status_from_campaign(
    db: &sqlx::PgPool,
    campaign_id: Uuid,
    new_status: &str,
) {
    let _ = sqlx::query(
        "UPDATE badges SET status = $2 WHERE campaign_id = $1",
    )
    .bind(campaign_id)
    .bind(new_status)
    .execute(db)
    .await;
}

/// placement_key='forum_thread' olan kampanyalar için, onaylandığında
/// forum_topics tablosuna gerçek bir satır yazar. Pin'li ve
/// sponsor_campaign_id ile bu kampanyaya bağlı. Idempotent: aynı
/// campaign_id için ikinci kez çağrılırsa hiçbir şey yapmaz.
///
/// Diğer placement'larda no-op.
async fn ensure_sponsored_forum_topic(db: &sqlx::PgPool, campaign_id: Uuid) {
    use sqlx::Row;
    let row: Option<(String, Value)> = match sqlx::query_as(
        "SELECT placement_key, creative FROM ad_campaigns WHERE id = $1",
    )
    .bind(campaign_id)
    .fetch_optional(db)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::error!(?campaign_id, error = %e, "ensure_sponsored_forum_topic: campaign fetch failed");
            return;
        }
    };

    let Some((placement_key, creative)) = row else { return };
    if placement_key != "forum_thread" {
        return;
    }

    // Aynı kampanya için topic zaten varsa atla.
    let existing: Result<Option<sqlx::postgres::PgRow>, _> = sqlx::query(
        "SELECT id FROM forum_topics WHERE sponsor_campaign_id = $1 LIMIT 1",
    )
    .bind(campaign_id)
    .fetch_optional(db)
    .await;
    if let Ok(Some(_)) = existing {
        return;
    }

    let title = creative
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Sponsored discussion")
        .to_string();
    let body = creative
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let image_url = creative
        .get("image_url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // category='general' — sponsorlu thread'ler için varsayılan
    // bucket. Operatör isterse PATCH ile değiştirir.
    let insert = sqlx::query(
        r#"
        INSERT INTO forum_topics
            (user_id, title, body, category, is_anonymous, is_pinned,
             image_url, sponsor_campaign_id)
        VALUES (NULL, $1, $2, 'general', FALSE, TRUE, $3, $4)
        RETURNING id
        "#,
    )
    .bind(&title)
    .bind(&body)
    .bind(image_url.as_deref())
    .bind(campaign_id)
    .fetch_optional(db)
    .await;

    match insert {
        Ok(Some(r)) => {
            let topic_id: Uuid = r.get("id");
            tracing::info!(
                ?campaign_id,
                ?topic_id,
                "ensure_sponsored_forum_topic: created sponsored topic"
            );
        }
        Ok(None) => {}
        Err(e) => {
            tracing::error!(?campaign_id, error = %e, "ensure_sponsored_forum_topic: insert failed");
        }
    }
}

// ════════════════════════════════════════════════════════════════
// PLACEMENTS
// ════════════════════════════════════════════════════════════════

#[derive(Serialize)]
struct PlacementSummary {
    key: String,
    display_name: String,
    description: String,
    preview_image_url: Option<String>,
    creative_spec: Value,
    display_rules: Value,
    metrics_collected: Value,
    is_globally_enabled: bool,
    requires_auth: bool,
    active_campaigns_count: i64,
    impressions_30d: i64,
    clicks_30d: i64,
}

async fn list_placements(
    State(state): State<AppState>,
    ctx: AdminContext,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    // Brand_admin sees only placements they have a grant for.
    let scope = ctx.brand_scope();

    let rows = sqlx::query_as::<_, (
        String, String, String, Option<String>, Value, Value, Value, bool, bool,
        i64, Option<i64>, Option<i64>,
    )>(
        r#"
        SELECT
            p.key,
            p.display_name,
            p.description,
            p.preview_image_url,
            p.creative_spec,
            p.display_rules,
            p.metrics_collected,
            p.is_globally_enabled,
            p.requires_auth,
            COALESCE((
                SELECT COUNT(*) FROM ad_campaigns c
                WHERE c.placement_key = p.key
                  AND c.status = 'active'
                  AND c.deleted_at IS NULL
                  AND c.is_dry_run = FALSE
                  AND NOW() BETWEEN c.starts_at AND c.ends_at
                  AND ($1::uuid IS NULL OR c.brand_id = $1)
            ), 0) AS active_campaigns_count,
            COALESCE((
                SELECT SUM(impressions) FROM ad_placement_metrics m
                WHERE m.placement_key = p.key
                  AND m.date >= CURRENT_DATE - 30
            ), 0)::bigint AS impressions_30d,
            COALESCE((
                SELECT SUM(clicks) FROM ad_placement_metrics m
                WHERE m.placement_key = p.key
                  AND m.date >= CURRENT_DATE - 30
            ), 0)::bigint AS clicks_30d
        FROM ad_placements p
        WHERE $1::uuid IS NULL
           OR EXISTS (
               SELECT 1 FROM brand_placement_grants g
               WHERE g.brand_id = $1 AND g.placement_key = p.key
           )
        ORDER BY p.key
        "#,
    )
    .bind(scope)
    .fetch_all(&state.db)
    .await?;

    let placements: Vec<PlacementSummary> = rows
        .into_iter()
        .map(|r| PlacementSummary {
            key: r.0,
            display_name: r.1,
            description: r.2,
            preview_image_url: r.3,
            creative_spec: r.4,
            display_rules: r.5,
            metrics_collected: r.6,
            is_globally_enabled: r.7,
            requires_auth: r.8,
            active_campaigns_count: r.9,
            impressions_30d: r.10.unwrap_or(0),
            clicks_30d: r.11.unwrap_or(0),
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": placements, "error": null })))
}

async fn get_placement(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(key): Path<String>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    let row = fetch_placement_row(&state.db, &key).await?;
    Ok(Json(json!({ "success": true, "data": row, "error": null })))
}

#[derive(Deserialize)]
struct UpdatePlacementBody {
    display_name: Option<String>,
    description: Option<String>,
    preview_image_url: Option<Option<String>>,
    creative_spec: Option<Value>,
    display_rules: Option<Value>,
    metrics_collected: Option<Value>,
}

async fn update_placement(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(key): Path<String>,
    Json(body): Json<UpdatePlacementBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let before = fetch_placement_row(&state.db, &key).await?;

    sqlx::query(
        r#"
        UPDATE ad_placements SET
            display_name      = COALESCE($2, display_name),
            description       = COALESCE($3, description),
            preview_image_url = CASE WHEN $4::boolean THEN $5 ELSE preview_image_url END,
            creative_spec     = COALESCE($6, creative_spec),
            display_rules     = COALESCE($7, display_rules),
            metrics_collected = COALESCE($8, metrics_collected),
            updated_at        = NOW()
        WHERE key = $1
        "#,
    )
    .bind(&key)
    .bind(body.display_name.as_deref())
    .bind(body.description.as_deref())
    .bind(body.preview_image_url.is_some())
    .bind(body.preview_image_url.flatten())
    .bind(body.creative_spec.as_ref())
    .bind(body.display_rules.as_ref())
    .bind(body.metrics_collected.as_ref())
    .execute(&state.db)
    .await?;

    let after = fetch_placement_row(&state.db, &key).await?;
    write_audit(
        &state.db,
        &ctx,
        "placement_update",
        Some("placement"),
        None,
        None,
        Some(json!({ "key": key, "before": before, "after": after })),
    )
    .await;

    Ok(Json(json!({ "success": true, "data": after, "error": null })))
}

async fn enable_placement(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(key): Path<String>,
) -> Result<Json<Value>, AppError> {
    set_placement_enabled(&state, &ctx, &key, true).await
}

async fn disable_placement(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(key): Path<String>,
) -> Result<Json<Value>, AppError> {
    set_placement_enabled(&state, &ctx, &key, false).await
}

async fn set_placement_enabled(
    state: &AppState,
    ctx: &AdminContext,
    key: &str,
    enabled: bool,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let result = sqlx::query(
        "UPDATE ad_placements SET is_globally_enabled = $1, updated_at = NOW() WHERE key = $2",
    )
    .bind(enabled)
    .bind(key)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("placement {key} not found")));
    }

    write_audit(
        &state.db,
        ctx,
        if enabled { "placement_enable" } else { "placement_disable" },
        Some("placement"),
        None,
        None,
        Some(json!({ "key": key, "enabled": enabled })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "key": key, "is_globally_enabled": enabled },
        "error": null
    })))
}

async fn fetch_placement_row(db: &PgPool, key: &str) -> Result<Value, AppError> {
    let row = sqlx::query_as::<_, (
        String, String, String, Option<String>, Value, Value, Value, bool, bool,
    )>(
        r#"
        SELECT key, display_name, description, preview_image_url,
               creative_spec, display_rules, metrics_collected,
               is_globally_enabled, requires_auth
        FROM ad_placements WHERE key = $1
        "#,
    )
    .bind(key)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("placement {key} not found")))?;

    Ok(json!({
        "key": row.0,
        "display_name": row.1,
        "description": row.2,
        "preview_image_url": row.3,
        "creative_spec": row.4,
        "display_rules": row.5,
        "metrics_collected": row.6,
        "is_globally_enabled": row.7,
        "requires_auth": row.8,
    }))
}

// ════════════════════════════════════════════════════════════════
// PLACEMENT DETAIL
// ════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct DetailQuery {
    days: Option<i32>,
}

async fn get_placement_detail(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(key): Path<String>,
    Query(q): Query<DetailQuery>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let days = q.days.unwrap_or(30).clamp(1, 365);

    let placement = fetch_placement_row(&state.db, &key).await?;

    let series_rows = sqlx::query_as::<_, (chrono::NaiveDate, i32, i32, Value)>(
        r#"
        SELECT date, impressions, clicks, extra
        FROM ad_placement_metrics
        WHERE placement_key = $1
          AND date >= CURRENT_DATE - ($2::int - 1)
        ORDER BY date
        "#,
    )
    .bind(&key)
    .bind(days)
    .fetch_all(&state.db)
    .await?;

    let mut imps_total: i64 = 0;
    let mut clicks_total: i64 = 0;
    let mut metric_aggregates = serde_json::Map::new();
    let mut daily_series: Vec<Value> = Vec::with_capacity(series_rows.len());

    for (date, imps, clicks, extra) in &series_rows {
        imps_total += *imps as i64;
        clicks_total += *clicks as i64;
        if let Some(obj) = extra.as_object() {
            for (k, v) in obj {
                let cur = metric_aggregates
                    .get(k)
                    .and_then(|x| x.as_i64())
                    .unwrap_or(0);
                let add = v.as_i64().unwrap_or(0);
                metric_aggregates.insert(k.clone(), json!(cur + add));
            }
        }
        daily_series.push(json!({
            "date": date,
            "impressions": *imps,
            "clicks": *clicks,
        }));
    }

    let ctr = if imps_total > 0 {
        clicks_total as f64 / imps_total as f64
    } else {
        0.0
    };
    let avg_dwell_ms = {
        let count = metric_aggregates
            .get("dwell_ms_count")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let sum = metric_aggregates
            .get("dwell_ms_sum")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        if count > 0 {
            Some(sum as f64 / count as f64)
        } else {
            None
        }
    };

    let scope = ctx.brand_scope();

    let campaign_rows = sqlx::query_as::<_, (
        Uuid,
        String,
        i32,
        String,
        bool,
        DateTime<Utc>,
        DateTime<Utc>,
        Option<i64>,
        Option<i64>,
    )>(
        r#"
        SELECT
            c.id,
            c.brand_name,
            c.weight,
            c.status,
            c.is_dry_run,
            c.starts_at,
            c.ends_at,
            COALESCE((
                SELECT SUM(impressions) FROM ad_metrics m
                WHERE m.campaign_id = c.id
                  AND m.date >= CURRENT_DATE - ($2::int - 1)
            ), 0)::bigint AS impressions_total,
            COALESCE((
                SELECT SUM(clicks) FROM ad_metrics m
                WHERE m.campaign_id = c.id
                  AND m.date >= CURRENT_DATE - ($2::int - 1)
            ), 0)::bigint AS clicks_total
        FROM ad_campaigns c
        WHERE c.placement_key = $1
          AND c.status = 'active'
          AND c.deleted_at IS NULL
          AND c.is_dry_run = FALSE
          AND NOW() BETWEEN c.starts_at AND c.ends_at
          AND ($3::uuid IS NULL OR c.brand_id = $3)
        ORDER BY c.weight DESC, c.brand_name
        "#,
    )
    .bind(&key)
    .bind(days)
    .bind(scope)
    .fetch_all(&state.db)
    .await?;

    let active_campaigns: Vec<Value> = campaign_rows
        .into_iter()
        .map(|r| {
            let imps = r.7.unwrap_or(0);
            let clicks = r.8.unwrap_or(0);
            json!({
                "id": r.0,
                "brand_name": r.1,
                "weight": r.2,
                "status": r.3,
                "is_dry_run": r.4,
                "starts_at": r.5,
                "ends_at": r.6,
                "impressions_total": imps,
                "clicks_total": clicks,
                "ctr": if imps > 0 { clicks as f64 / imps as f64 } else { 0.0 },
            })
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": {
            "placement": placement,
            "window_days": days,
            "totals": {
                "impressions": imps_total,
                "clicks": clicks_total,
                "ctr": ctr,
                "avg_dwell_ms": avg_dwell_ms,
                "metric_aggregates": Value::Object(metric_aggregates),
            },
            "daily_series": daily_series,
            "active_campaigns": active_campaigns,
        },
        "error": null,
    })))
}

// ════════════════════════════════════════════════════════════════
// CAMPAIGNS
// ════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct ListCampaignsQuery {
    /// Filter by status. 'all' (default), 'draft', 'pending_review',
    /// 'active', 'paused', 'rejected', 'scheduled', 'expired',
    /// 'dry_run'.
    status: Option<String>,
    placement_key: Option<String>,
    brand_id: Option<Uuid>,
    /// Super-only: include deleted tombstones.
    include_deleted: Option<bool>,
}

#[derive(sqlx::FromRow)]
struct CampaignRow {
    id: Uuid,
    brand_id: Uuid,
    brand_name: String,
    placement_key: String,
    creative: Value,
    click_url: String,
    target_segment: Option<Value>,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
    weight: i32,
    status: String,
    is_active: bool,
    is_dry_run: bool,
    deleted_at: Option<DateTime<Utc>>,
    pricing_model: Option<String>,
    unit_price_cents: Option<i32>,
    total_budget_cents: Option<i64>,
    target_impressions: Option<i32>,
    duration_months: Option<i16>,
    spent_cents: i64,
    paused_reason: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: Option<DateTime<Utc>>,
    impressions_total: i64,
    clicks_total: i64,
}

fn campaign_row_to_json(r: CampaignRow) -> Value {
    let progress = match r.total_budget_cents {
        Some(b) if b > 0 => Some((r.spent_cents as f64 / b as f64) * 100.0),
        _ => None,
    };
    json!({
        "id": r.id,
        "brand_id": r.brand_id,
        "brand_name": r.brand_name,
        "placement_key": r.placement_key,
        "creative": r.creative,
        "click_url": r.click_url,
        "target_segment": r.target_segment,
        "starts_at": r.starts_at,
        "ends_at": r.ends_at,
        "weight": r.weight,
        "status": r.status,
        "is_active": r.is_active,
        "is_dry_run": r.is_dry_run,
        "deleted_at": r.deleted_at,
        "pricing_model": r.pricing_model,
        "unit_price_cents": r.unit_price_cents,
        "total_budget_cents": r.total_budget_cents,
        "target_impressions": r.target_impressions,
        "duration_months": r.duration_months,
        "spent_cents": r.spent_cents,
        "progress_percent": progress,
        "paused_reason": r.paused_reason,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
        "impressions_total": r.impressions_total,
        "clicks_total": r.clicks_total,
    })
}

async fn list_campaigns(
    State(state): State<AppState>,
    ctx: AdminContext,
    Query(q): Query<ListCampaignsQuery>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let include_deleted = q.include_deleted.unwrap_or(false)
        && ctx.effective_role() == AdminRole::Super;

    // Effective scope: brand_admin always self-scoped; super may
    // narrow via ?brand_id=, otherwise sees all.
    let effective_scope = ctx.brand_scope().or(q.brand_id);

    let status_clause = match q.status.as_deref().unwrap_or("all") {
        "draft" => "AND c.status = 'draft'",
        "pending_review" => "AND c.status = 'pending_review'",
        "active" => "AND c.status = 'active' AND c.is_dry_run = FALSE \
                     AND NOW() BETWEEN c.starts_at AND c.ends_at",
        "paused" => "AND c.status = 'paused'",
        "rejected" => "AND c.status = 'rejected'",
        "scheduled" => "AND c.status = 'active' AND NOW() < c.starts_at",
        "expired" => "AND NOW() > c.ends_at",
        "dry_run" => "AND c.is_dry_run = TRUE",
        _ => "",
    };

    let deleted_clause = if include_deleted {
        ""
    } else {
        "AND c.deleted_at IS NULL"
    };

    let sql = format!(
        r#"
        SELECT
            c.id, c.brand_id, c.brand_name, c.placement_key, c.creative, c.click_url,
            c.target_segment, c.starts_at, c.ends_at, c.weight,
            c.status, c.is_active, c.is_dry_run, c.deleted_at,
            c.pricing_model, c.unit_price_cents, c.total_budget_cents,
            c.target_impressions, c.duration_months,
            c.spent_cents, c.paused_reason,
            c.created_at, c.updated_at,
            COALESCE((SELECT SUM(impressions) FROM ad_metrics m WHERE m.campaign_id = c.id), 0)::bigint AS impressions_total,
            COALESCE((SELECT SUM(clicks)      FROM ad_metrics m WHERE m.campaign_id = c.id), 0)::bigint AS clicks_total
        FROM ad_campaigns c
        WHERE ($1::uuid IS NULL OR c.brand_id = $1)
          AND ($2::varchar IS NULL OR c.placement_key = $2)
          {deleted_clause}
          {status_clause}
        ORDER BY c.created_at DESC
        "#
    );

    let rows = sqlx::query_as::<_, CampaignRow>(&sql)
        .bind(effective_scope)
        .bind(q.placement_key.as_deref())
        .fetch_all(&state.db)
        .await?;

    let campaigns: Vec<Value> = rows.into_iter().map(campaign_row_to_json).collect();

    Ok(Json(json!({ "success": true, "data": campaigns, "error": null })))
}

#[derive(Deserialize)]
struct CreateCampaignBody {
    /// Required for super_admin. For brand_admin, server overrides
    /// with ctx.brand_id; body value is ignored.
    brand_id: Option<Uuid>,
    placement_key: String,
    creative: Value,
    click_url: String,
    target_segment: Option<Value>,
    starts_at: DateTime<Utc>,
    weight: Option<i32>,
    is_dry_run: Option<bool>,
    /// Paket tier'i (1/3/6/12). Süre, included impression sayısı ve birim
    /// fiyat hep bu seçimden gelir; brand serbest impression girişi yapamaz.
    duration_months: i16,
    /// placement_key='badge_sponsor' için zorunlu. Brand kendi badge'ini
    /// tasarlar; super onayladığında `badges` tablosuna yazılır,
    /// kampanya statüsüyle senkronize çalışır.
    badge_spec: Option<BadgeSpec>,
}

/// 100 TL katına yukarı yuvarla (10000 kuruş). Pozitif input bekler.
fn round_up_to_100_tl(cents: i64) -> i64 {
    let unit: i64 = 10_000;
    if cents <= 0 {
        return 0;
    }
    ((cents + unit - 1) / unit) * unit
}

/// CPM cost'unu yukarı yuvarlamayla hesapla:
/// `ceil(impressions * unit_price_cents / 1000)`. Pozitif input bekler.
fn ceil_div_1000(numerator: i64) -> i64 {
    (numerator + 999) / 1000
}

/// (placement, duration_months) tier'inin aktif paket tanımı:
/// `(unit_price_cents, included_impressions)`. Brand'in seçtiği tier
/// = bu paket; cost = bundle'ın yuvarlanmış toplam fiyatı.
async fn lookup_active_tier_bundle(
    db: &PgPool,
    placement_key: &str,
    duration_months: i16,
) -> Result<(i32, i32), AppError> {
    let row: Option<(i32, i32)> = sqlx::query_as(
        r#"
        SELECT unit_price_cents, included_impressions
        FROM placement_pricing
        WHERE placement_key = $1
          AND pricing_model = 'cpm'
          AND duration_months = $2
          AND effective_to IS NULL
        "#,
    )
    .bind(placement_key)
    .bind(duration_months)
    .fetch_optional(db)
    .await?;
    row.ok_or_else(|| {
        AppError::BadRequest(format!(
            "no active pricing tier for placement '{placement_key}' \
             at duration_months={duration_months}"
        ))
    })
}

fn actor_label_for(ctx: &AdminContext) -> String {
    match (ctx.admin_user_id, ctx.actor_name.as_deref()) {
        (Some(uid), _) => format!("admin_user:{uid}"),
        (None, Some(name)) => format!("env_super:{name}"),
        (None, None) => "env_super".to_string(),
    }
}

#[derive(Deserialize)]
struct BadgeSpec {
    name: String,
    description: String,
    icon: String,
    category: String,
    threshold: i32,
    image_url: Option<String>,
    gender: Option<String>,
    /// Opsiyonel zengin kriter spec'i. Verilirse evaluator unlock kararını
    /// bu spec'ten verir; legacy category/threshold yolu kullanılmaz.
    /// Boş veya tanımsız ise (mevcut platform badge mantığı gibi)
    /// category/threshold üzerinden değerlendirilir.
    criteria: Option<crate::services::badge_criteria::BadgeCriteria>,
}

async fn create_campaign(
    State(state): State<AppState>,
    ctx: AdminContext,
    Json(body): Json<CreateCampaignBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    if !crate::handlers::admin_pricing::is_allowed_duration(body.duration_months) {
        return Err(AppError::BadRequest(
            "duration_months_must_be_1_3_6_or_12".to_string(),
        ));
    }

    // ends_at = starts_at + duration_months (takvim-bilinçli).
    let ends_at = body
        .starts_at
        .checked_add_months(chrono::Months::new(body.duration_months as u32))
        .ok_or_else(|| AppError::BadRequest("ends_at overflow".to_string()))?;

    let weight = body.weight.unwrap_or(1);
    if weight < 1 {
        return Err(AppError::BadRequest("weight must be >= 1".to_string()));
    }

    // Resolve effective brand_id
    let effective_brand_id = match ctx.brand_scope() {
        Some(b) => b, // brand_admin or super impersonating — force ctx brand
        None => body.brand_id.ok_or_else(|| {
            AppError::BadRequest(
                "brand_id is required when calling as super_admin".to_string(),
            )
        })?,
    };

    // Resolve brand_name (denormalized cache; keeps existing FK-less callers working)
    let brand_name: String =
        sqlx::query_scalar("SELECT display_name FROM brands WHERE id = $1 AND is_active = TRUE")
            .bind(effective_brand_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| {
                AppError::NotFound(format!("brand {effective_brand_id} not found or inactive"))
            })?;

    // Verify the brand has a grant for this placement
    let granted: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM brand_placement_grants \
         WHERE brand_id = $1 AND placement_key = $2)",
    )
    .bind(effective_brand_id)
    .bind(&body.placement_key)
    .fetch_one(&state.db)
    .await?;
    if !granted {
        return Err(AppError::Forbidden(format!(
            "brand has no grant for placement '{}'",
            body.placement_key
        )));
    }

    // Validate creative against placement spec.
    let spec: Value = sqlx::query_scalar("SELECT creative_spec FROM ad_placements WHERE key = $1")
        .bind(&body.placement_key)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!("unknown placement_key: {}", body.placement_key))
        })?;
    validate_creative(&spec, &body.creative)?;

    // Tier paketini oku — included impression sayısı ve CPM birim fiyatı bundan.
    // Server-side authority — brand body'sinden impression/fiyat geçirmez.
    let (unit_price_cents, included_impressions) = lookup_active_tier_bundle(
        &state.db,
        &body.placement_key,
        body.duration_months,
    )
    .await?;
    let raw_cost: i64 =
        ceil_div_1000(included_impressions as i64 * unit_price_cents as i64);
    let cost_cents = round_up_to_100_tl(raw_cost);

    // badge_sponsor: brand kendi badge'ini tasarlar; transaction içinde
    // hem ad_campaigns hem badges satırı yaratılır, badge campaign'in
    // statüsünü mirror'lar (draft → pending_review → active → archived).
    let badge_spec = if body.placement_key == "badge_sponsor" {
        let spec = body.badge_spec.as_ref().ok_or_else(|| {
            AppError::BadRequest(
                "badge_spec required for placement 'badge_sponsor'".to_string(),
            )
        })?;
        validate_badge_spec(spec)?;
        Some(spec)
    } else {
        None
    };

    let id = Uuid::now_v7();
    let mut tx = state.db.begin().await?;

    // ── Balance check + deduct (atomic) ──────────────────────
    let current_balance: Option<i64> = sqlx::query_scalar(
        "SELECT balance_cents FROM brands WHERE id = $1 FOR UPDATE",
    )
    .bind(effective_brand_id)
    .fetch_optional(&mut *tx)
    .await?;
    let current_balance = current_balance.ok_or_else(|| {
        AppError::NotFound(format!("brand {effective_brand_id} not found"))
    })?;

    if current_balance < cost_cents {
        return Err(AppError::BadRequest(format!(
            "insufficient_balance: need {} cents, have {}",
            cost_cents, current_balance
        )));
    }

    let new_balance = current_balance - cost_cents;
    sqlx::query("UPDATE brands SET balance_cents = $1, updated_at = NOW() WHERE id = $2")
        .bind(new_balance)
        .bind(effective_brand_id)
        .execute(&mut *tx)
        .await?;

    let actor = actor_label_for(&ctx);
    sqlx::query(
        r#"
        INSERT INTO brand_wallet_transactions
            (brand_id, kind, amount_cents, balance_after_cents,
             ref_kind, ref_id, description,
             admin_user_id, actor_label, impersonating_brand_id)
        VALUES ($1, 'purchase', $2, $3, 'campaign', $4, $5, $6, $7, $8)
        "#,
    )
    .bind(effective_brand_id)
    .bind(-cost_cents)
    .bind(new_balance)
    .bind(id)
    .bind(format!(
        "{}-month tier package: {} impressions @ {} cents/1k",
        body.duration_months, included_impressions, unit_price_cents
    ))
    .bind(ctx.admin_user_id)
    .bind(&actor)
    .bind(ctx.impersonating_brand_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO ad_campaigns
            (id, brand_id, brand_name, placement_key, creative, click_url,
             target_segment, starts_at, ends_at, weight,
             is_active, is_dry_run, status,
             pricing_model, unit_price_cents, total_budget_cents,
             target_impressions, duration_months)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                FALSE, $11, 'pending_review',
                'cpm', $12, $13, $14, $15)
        "#,
    )
    .bind(id)
    .bind(effective_brand_id)
    .bind(&brand_name)
    .bind(&body.placement_key)
    .bind(&body.creative)
    .bind(&body.click_url)
    .bind(body.target_segment.as_ref())
    .bind(body.starts_at)
    .bind(ends_at)
    .bind(weight)
    .bind(body.is_dry_run.unwrap_or(false))
    .bind(unit_price_cents)
    .bind(cost_cents)
    .bind(included_impressions)
    .bind(body.duration_months)
    .execute(&mut *tx)
    .await
    .map_err(map_badge_unique_violation)?;

    if let Some(spec) = badge_spec {
        // tier='premium' brand badge'lere otomatik atanır — sözleşmenin
        // görsel ayrıcalığı bu kolonla taşınır, brand seçim yapamaz.
        // criteria JSONB: spec.criteria varsa serialize edip yazılır;
        // unlock check'i evaluator'a düşer (category/threshold legacy fallback).
        let criteria_json = spec
            .criteria
            .as_ref()
            .map(serde_json::to_value)
            .transpose()
            .map_err(|e| {
                AppError::Internal(format!("badge criteria serialize: {e}"))
            })?;
        // sponsor_click_url badges'ten kaldırıldı (migration 054). Brand
        // badge'inin redirect URL'i ad_campaigns.click_url'den okunur —
        // tek source of truth.
        sqlx::query(
            r#"
            INSERT INTO badges
                (name, description, icon, category, threshold, image_url,
                 gender, is_sponsored, sponsor_name, sponsor_logo_url,
                 brand_id, campaign_id, status, tier, criteria)
            VALUES ($1, $2, $3, $4, $5, $6,
                    COALESCE($7, 'both'), TRUE, $8, NULL,
                    $9, $10, 'draft', 'premium', $11)
            "#,
        )
        .bind(&spec.name)
        .bind(&spec.description)
        .bind(&spec.icon)
        .bind(&spec.category)
        .bind(spec.threshold)
        .bind(spec.image_url.as_deref())
        .bind(spec.gender.as_deref())
        .bind(&brand_name)
        .bind(effective_brand_id)
        .bind(id)
        .bind(criteria_json)
        .execute(&mut *tx)
        .await
        .map_err(map_badge_unique_violation)?;
    }

    tx.commit().await?;

    let after = fetch_campaign_row(&state.db, id).await?;
    write_audit(
        &state.db,
        &ctx,
        "campaign_create",
        Some("campaign"),
        Some(id),
        Some(effective_brand_id),
        Some(json!({ "after": after })),
    )
    .await;

    Ok(Json(json!({ "success": true, "data": after, "error": null })))
}

fn validate_pricing(
    pricing_model: &Option<String>,
    unit_price_cents: Option<i32>,
    total_budget_cents: Option<i64>,
) -> Result<(), AppError> {
    let Some(model) = pricing_model.as_deref() else {
        return Ok(()); // nothing set
    };
    match model {
        "flat" => {
            // unit_price / total_budget may be NULL for flat
            Ok(())
        }
        "cpm" | "cpc" => {
            let unit = unit_price_cents
                .ok_or_else(|| AppError::BadRequest(format!("{model} requires unit_price_cents")))?;
            if unit <= 0 {
                return Err(AppError::BadRequest("unit_price_cents must be > 0".to_string()));
            }
            let budget = total_budget_cents
                .ok_or_else(|| AppError::BadRequest(format!("{model} requires total_budget_cents")))?;
            if budget <= 0 {
                return Err(AppError::BadRequest(
                    "total_budget_cents must be > 0".to_string(),
                ));
            }
            Ok(())
        }
        _ => Err(AppError::BadRequest(format!("unknown pricing_model: {model}"))),
    }
}

async fn get_campaign(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    let data = fetch_campaign_row(&state.db, id).await?;
    let brand_id: Uuid = data
        .get("brand_id")
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::Internal("missing brand_id".to_string()))?;
    ctx.require_brand_scope(brand_id)?;
    Ok(Json(json!({ "success": true, "data": data, "error": null })))
}

#[derive(Deserialize)]
struct UpdateCampaignBody {
    creative: Option<Value>,
    // click_url is intentionally NOT in this struct. The redirect URL is
    // locked at campaign creation and cannot be edited — prevents brands
    // from silently re-targeting a running ad to a different landing page.
    target_segment: Option<Option<Value>>,
    starts_at: Option<DateTime<Utc>>,
    ends_at: Option<DateTime<Utc>>,
    weight: Option<i32>,
    is_dry_run: Option<bool>,
    // T0.4 — super only; silently dropped from brand_admin body
    pricing_model: Option<String>,
    unit_price_cents: Option<i32>,
    total_budget_cents: Option<i64>,
}

async fn update_campaign(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateCampaignBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let (brand_id, before_paused_reason, before_total_budget) = sqlx::query_as::<_, (Uuid, Option<String>, Option<i64>)>(
        "SELECT brand_id, paused_reason, total_budget_cents FROM ad_campaigns WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("campaign {id} not found")))?;
    ctx.require_brand_scope(brand_id)?;

    let before = fetch_campaign_row(&state.db, id).await?;

    if let Some(ref creative) = body.creative {
        let placement_key = before
            .get("placement_key")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::Internal("placement_key missing".to_string()))?;
        let spec: Value =
            sqlx::query_scalar("SELECT creative_spec FROM ad_placements WHERE key = $1")
                .bind(placement_key)
                .fetch_one(&state.db)
                .await?;
        validate_creative(&spec, creative)?;
    }

    if let (Some(s), Some(e)) = (body.starts_at, body.ends_at) {
        if e <= s {
            return Err(AppError::BadRequest(
                "ends_at must be strictly after starts_at".to_string(),
            ));
        }
    }

    let is_super = ctx.effective_role() == AdminRole::Super;

    // T0.4 — only super may touch pricing/budget; brand_admin fields silently dropped.
    let (pricing_model, unit_price_cents, total_budget_cents) = if is_super {
        validate_pricing(
            &body.pricing_model,
            body.unit_price_cents,
            body.total_budget_cents,
        )?;
        (
            body.pricing_model.clone(),
            body.unit_price_cents,
            body.total_budget_cents,
        )
    } else {
        (None, None, None)
    };

    sqlx::query(
        r#"
        UPDATE ad_campaigns SET
            creative       = COALESCE($2, creative),
            target_segment = CASE WHEN $3::boolean THEN $4 ELSE target_segment END,
            starts_at      = COALESCE($5, starts_at),
            ends_at        = COALESCE($6, ends_at),
            weight         = COALESCE($7, weight),
            is_dry_run     = COALESCE($8, is_dry_run),
            pricing_model      = COALESCE($9, pricing_model),
            unit_price_cents   = COALESCE($10, unit_price_cents),
            total_budget_cents = COALESCE($11, total_budget_cents),
            updated_at     = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(body.creative.as_ref())
    .bind(body.target_segment.is_some())
    .bind(body.target_segment.as_ref().and_then(|x| x.as_ref()))
    .bind(body.starts_at)
    .bind(body.ends_at)
    .bind(body.weight)
    .bind(body.is_dry_run)
    .bind(pricing_model.as_deref())
    .bind(unit_price_cents)
    .bind(total_budget_cents)
    .execute(&state.db)
    .await?;

    // T0.4 — if super raised total_budget on a budget-exhausted campaign,
    // clear the alert threshold so subsequent cron passes can re-fire
    // 50/80/95 if applicable.
    if let Some(new_budget) = total_budget_cents {
        if before_paused_reason.as_deref() == Some("budget_exhausted") {
            if let Some(old_budget) = before_total_budget {
                if new_budget > old_budget {
                    let _ = sqlx::query(
                        "UPDATE ad_campaigns SET last_alert_threshold = NULL WHERE id = $1",
                    )
                    .bind(id)
                    .execute(&state.db)
                    .await;
                }
            }
        }
    }

    let after = fetch_campaign_row(&state.db, id).await?;
    write_audit(
        &state.db,
        &ctx,
        "campaign_update",
        Some("campaign"),
        Some(id),
        Some(brand_id),
        Some(json!({ "before": before, "after": after })),
    )
    .await;

    Ok(Json(json!({ "success": true, "data": after, "error": null })))
}

// ── Status transitions (T0.1 + T0.4) ──────────────────────────
//
// `pause_campaign` / `activate_campaign` are kept as legacy aliases
// so existing admin UI buttons continue to work. The richer state
// machine endpoints (submit-for-review, approve, reject, resume) are
// added in T3.3.

async fn pause_campaign(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    let brand_id = fetch_campaign_brand(&state.db, id).await?;
    ctx.require_brand_scope(brand_id)?;

    // Brand_admin (veya super impersonating brand) → 'manual_brand'.
    // Saf super_admin → 'manual_super'. Audit ayrımı için.
    let reason = if ctx.effective_role() == AdminRole::Brand {
        "manual_brand"
    } else {
        "manual_super"
    };

    let res = sqlx::query(
        r#"
        UPDATE ad_campaigns
        SET status = 'paused',
            paused_reason = $2,
            is_active = FALSE,
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
          AND status IN ('active','pending_review','draft')
        "#,
    )
    .bind(id)
    .bind(reason)
    .execute(&state.db)
    .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::BadRequest(
            "cannot pause from current status".to_string(),
        ));
    }

    sync_badge_status_from_campaign(&state.db, id, "paused").await;

    write_audit(
        &state.db,
        &ctx,
        "campaign_pause",
        Some("campaign"),
        Some(id),
        Some(brand_id),
        Some(json!({ "reason": reason })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "status": "paused" },
        "error": null
    })))
}

async fn activate_campaign(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    // Legacy "activate" — super-only shortcut to flip status='active'.
    // T3.3 adds proper approval-state machine; this stays for direct
    // super_admin override.
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let row: Option<(Uuid, Option<String>)> = sqlx::query_as(
        "SELECT brand_id, paused_reason FROM ad_campaigns WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;
    let (brand_id, paused_reason) =
        row.ok_or_else(|| AppError::NotFound(format!("campaign {id} not found")))?;

    if paused_reason.as_deref() == Some("budget_exhausted") {
        return Err(AppError::BadRequest(
            "budget exhausted — raise total_budget_cents before activating".to_string(),
        ));
    }

    let res = sqlx::query(
        r#"
        UPDATE ad_campaigns
        SET status = 'active',
            paused_reason = NULL,
            is_active = TRUE,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("campaign {id} not found")));
    }

    sync_badge_status_from_campaign(&state.db, id, "active").await;

    write_audit(
        &state.db,
        &ctx,
        "campaign_activate",
        Some("campaign"),
        Some(id),
        Some(brand_id),
        Some(json!({ "status": "active" })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "status": "active" },
        "error": null
    })))
}

// ════════════════════════════════════════════════════════════════
// DELETE /api/admin/campaigns/:id      (T0.2 soft delete)
// POST   /api/admin/campaigns/:id/restore  (super only)
// ════════════════════════════════════════════════════════════════

async fn delete_campaign(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    // BRAND_BALANCE_PLAN.md 11.5: cancel super-only. Brand_admin pause edebilir
    // ama paketi öldüremez; iade kararı super'da.
    ctx.require_super()?;
    let brand_id = fetch_campaign_brand(&state.db, id).await?;

    let before = fetch_campaign_row(&state.db, id).await?;

    // Capture pre-delete status in audit so restore can recover it.
    let res = sqlx::query(
        r#"
        UPDATE ad_campaigns
        SET deleted_at = NOW(),
            status = 'paused',
            paused_reason = 'deleted',
            is_active = FALSE,
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    if res.rows_affected() == 0 {
        // Already deleted — idempotent
        return Ok(Json(json!({
            "success": true,
            "data": { "id": id, "deleted": true, "idempotent": true },
            "error": null
        })));
    }

    // Brand badge'i kampanya silindiğinde archived'a düşer
    // (unlock'lar kalır, yeni unlock yok).
    sync_badge_status_from_campaign(&state.db, id, "archived").await;

    write_audit(
        &state.db,
        &ctx,
        "campaign_delete",
        Some("campaign"),
        Some(id),
        Some(brand_id),
        Some(json!({ "before": before })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "deleted": true },
        "error": null
    })))
}

async fn restore_campaign(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let row: Option<(Uuid, Option<DateTime<Utc>>)> =
        sqlx::query_as("SELECT brand_id, deleted_at FROM ad_campaigns WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    let (brand_id, deleted_at) =
        row.ok_or_else(|| AppError::NotFound(format!("campaign {id} not found")))?;
    if deleted_at.is_none() {
        return Err(AppError::BadRequest(
            "campaign is not deleted".to_string(),
        ));
    }

    // Recover previous status from the most recent audit log entry that
    // captured before.status (i.e. campaign_delete event).
    let prior_status: Option<String> = sqlx::query_scalar(
        r#"
        SELECT diff->'before'->>'status'
        FROM ad_audit_log
        WHERE target_kind = 'campaign'
          AND target_id = $1
          AND action = 'campaign_delete'
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .flatten();

    // Restore to 'paused' as a safe default; super_admin can resume
    // manually after reviewing the campaign.
    let restored_status = prior_status.as_deref().unwrap_or("paused");
    let restored_status = match restored_status {
        "active" => "paused", // never restore to active without explicit resume
        other => other,
    };

    sqlx::query(
        r#"
        UPDATE ad_campaigns
        SET deleted_at = NULL,
            status = $2,
            paused_reason = CASE WHEN $2 = 'paused' THEN 'restored' ELSE NULL END,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(restored_status)
    .execute(&state.db)
    .await?;

    sync_badge_status_from_campaign(&state.db, id, restored_status).await;

    write_audit(
        &state.db,
        &ctx,
        "campaign_restore",
        Some("campaign"),
        Some(id),
        Some(brand_id),
        Some(json!({ "restored_status": restored_status })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "status": restored_status },
        "error": null
    })))
}

async fn fetch_campaign_brand(db: &PgPool, id: Uuid) -> Result<Uuid, AppError> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT brand_id FROM ad_campaigns WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("campaign {id} not found")))
}

async fn fetch_campaign_row(db: &PgPool, id: Uuid) -> Result<Value, AppError> {
    let row = sqlx::query_as::<_, CampaignRow>(
        r#"
        SELECT
            c.id, c.brand_id, c.brand_name, c.placement_key, c.creative, c.click_url,
            c.target_segment, c.starts_at, c.ends_at, c.weight,
            c.status, c.is_active, c.is_dry_run, c.deleted_at,
            c.pricing_model, c.unit_price_cents, c.total_budget_cents,
            c.target_impressions, c.duration_months,
            c.spent_cents, c.paused_reason,
            c.created_at, c.updated_at,
            COALESCE((SELECT SUM(impressions) FROM ad_metrics m WHERE m.campaign_id = c.id), 0)::bigint AS impressions_total,
            COALESCE((SELECT SUM(clicks)      FROM ad_metrics m WHERE m.campaign_id = c.id), 0)::bigint AS clicks_total
        FROM ad_campaigns c
        WHERE c.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("campaign {id} not found")))?;

    Ok(campaign_row_to_json(row))
}

// ════════════════════════════════════════════════════════════════
// GET /api/admin/ads/campaigns/:id/badge
// ────────────────────────────────────────────────────────────────
// Bir badge_sponsor kampanyasına bağlı badge satırını döndürür.
// Approval queue burayı çağırıp super'a "onaylarsan kullanıcı bunu
// göreceK" preview'ını oluşturur. Brand_admin yalnız kendi brand'inin
// badge'ini görebilir (brand_scope guard).
// ════════════════════════════════════════════════════════════════

async fn get_campaign_badge(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let row: Option<(
        i32,
        String,
        String,
        String,
        String,
        i32,
        Option<String>,
        String,
        bool,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<Uuid>,
        String,
        Option<String>,
    )> = sqlx::query_as(
        r#"
        SELECT b.id, b.name, b.description, b.icon, b.category, b.threshold, b.image_url,
               b.gender, b.is_sponsored, b.sponsor_name, b.sponsor_logo_url,
               c.click_url AS sponsor_click_url, b.brand_id, b.status, b.tier
        FROM badges b
        JOIN ad_campaigns c ON c.id = b.campaign_id
        WHERE b.campaign_id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    let Some(r) = row else {
        return Err(AppError::NotFound(format!(
            "campaign {id} has no linked badge"
        )));
    };

    if let Some(bid) = r.12 {
        ctx.require_brand_scope(bid)?;
    }

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": r.0,
            "name": r.1,
            "description": r.2,
            "icon": r.3,
            "category": r.4,
            "threshold": r.5,
            "image_url": r.6,
            "gender": r.7,
            "is_sponsored": r.8,
            "sponsor_name": r.9,
            "sponsor_logo_url": r.10,
            "sponsor_click_url": r.11,
            "brand_id": r.12,
            "status": r.13,
            "tier": r.14,
        },
        "error": null
    })))
}

// ════════════════════════════════════════════════════════════════
// CAMPAIGN DETAIL
// ════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct CampaignDetailQuery {
    days: Option<i32>,
}

async fn get_campaign_detail(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
    Query(q): Query<CampaignDetailQuery>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let days = q.days.unwrap_or(30).clamp(1, 365);

    let campaign = fetch_campaign_row(&state.db, id).await?;
    let brand_id: Uuid = campaign
        .get("brand_id")
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::Internal("missing brand_id".to_string()))?;
    ctx.require_brand_scope(brand_id)?;

    let placement_key = campaign
        .get("placement_key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Internal("placement_key missing".to_string()))?
        .to_string();

    let metrics_collected: Value = sqlx::query_scalar(
        "SELECT metrics_collected FROM ad_placements WHERE key = $1",
    )
    .bind(&placement_key)
    .fetch_one(&state.db)
    .await?;

    let series_rows = sqlx::query_as::<_, (chrono::NaiveDate, i32, i32, Value)>(
        r#"
        SELECT date, impressions, clicks, extra
        FROM ad_metrics
        WHERE campaign_id = $1
          AND date >= CURRENT_DATE - ($2::int - 1)
        ORDER BY date
        "#,
    )
    .bind(id)
    .bind(days)
    .fetch_all(&state.db)
    .await?;

    let mut imps_window: i64 = 0;
    let mut clicks_window: i64 = 0;
    let mut metric_aggregates = serde_json::Map::new();
    let mut daily_series: Vec<Value> = Vec::with_capacity(series_rows.len());
    let mut today_impressions: i32 = 0;
    let today = chrono::Utc::now().date_naive();

    for (date, imps, clicks, extra) in &series_rows {
        imps_window += *imps as i64;
        clicks_window += *clicks as i64;
        if *date == today {
            today_impressions = *imps;
        }
        if let Some(obj) = extra.as_object() {
            for (k, v) in obj {
                let cur = metric_aggregates
                    .get(k)
                    .and_then(|x| x.as_i64())
                    .unwrap_or(0);
                let add = v.as_i64().unwrap_or(0);
                metric_aggregates.insert(k.clone(), json!(cur + add));
            }
        }
        let row_ctr = if *imps > 0 {
            *clicks as f64 / *imps as f64
        } else {
            0.0
        };
        daily_series.push(json!({
            "date": date,
            "impressions": *imps,
            "clicks": *clicks,
            "ctr": row_ctr,
        }));
    }

    let ctr_window = if imps_window > 0 {
        clicks_window as f64 / imps_window as f64
    } else {
        0.0
    };
    let avg_dwell_ms = {
        let count = metric_aggregates
            .get("dwell_ms_count")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let sum = metric_aggregates
            .get("dwell_ms_sum")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        if count > 0 {
            Some(sum as f64 / count as f64)
        } else {
            None
        }
    };

    let audit_rows = sqlx::query_as::<_, (
        Uuid, String, String, Option<Value>, DateTime<Utc>,
    )>(
        r#"
        SELECT id, actor, action, diff, created_at
        FROM ad_audit_log
        WHERE target_kind = 'campaign' AND target_id = $1
        ORDER BY created_at DESC
        LIMIT 50
        "#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    let audit_log: Vec<Value> = audit_rows
        .into_iter()
        .map(|r| json!({
            "id": r.0,
            "actor": r.1,
            "action": r.2,
            "diff": r.3,
            "created_at": r.4,
        }))
        .collect();

    let target_segment = campaign.get("target_segment").cloned().unwrap_or(Value::Null);
    let segment_breakdown = compute_segment_breakdown(&state.db, &target_segment).await?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "campaign": campaign,
            "window_days": days,
            "metrics_collected": metrics_collected,
            "totals": {
                "impressions": imps_window,
                "clicks": clicks_window,
                "ctr": ctr_window,
                "avg_dwell_ms": avg_dwell_ms,
                "today_impressions": today_impressions,
                "metric_aggregates": Value::Object(metric_aggregates),
            },
            "daily_series": daily_series,
            "audit_log": audit_log,
            "segment_breakdown": segment_breakdown,
        },
        "error": null,
    })))
}

async fn compute_segment_breakdown(
    db: &PgPool,
    target_segment: &Value,
) -> Result<Vec<Value>, AppError> {
    let Some(target) = target_segment.as_object() else {
        return Ok(Vec::new());
    };

    let latest_date: Option<chrono::NaiveDate> = sqlx::query_scalar(
        "SELECT MAX(date) FROM segment_metrics",
    )
    .fetch_one(db)
    .await?;
    let Some(latest_date) = latest_date else {
        return Ok(Vec::new());
    };

    let mut requested_keys: Vec<&str> = Vec::new();
    if target.contains_key("city_ids") {
        requested_keys.push("top_city_dates");
    }
    if target.contains_key("age_ranges") {
        requested_keys.push("partner_age_range");
    }
    if target.contains_key("behaviors") {
        requested_keys.push("active_dater_30d");
        requested_keys.push("high_frequency_30d");
        requested_keys.push("single_proxy");
    }
    if requested_keys.is_empty() {
        return Ok(Vec::new());
    }

    let rows = sqlx::query_as::<_, (String, String, i32)>(
        r#"
        SELECT segment_key, segment_value, cohort_size
        FROM segment_metrics
        WHERE date = $1 AND segment_key = ANY($2)
        ORDER BY segment_key, cohort_size DESC
        "#,
    )
    .bind(latest_date)
    .bind(&requested_keys)
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| json!({
            "segment_key": r.0,
            "segment_value": r.1,
            "cohort_size": r.2,
        }))
        .collect())
}

// ════════════════════════════════════════════════════════════════
// CAMPAIGN STATE MACHINE (T3.3)
// ════════════════════════════════════════════════════════════════
//
// Allowed transitions:
//   draft           → pending_review     (brand_admin: submit-for-review)
//   pending_review  → active             (super: approve)
//   pending_review  → rejected           (super: reject)
//   active          → paused             (both: pause)
//   paused          → active             (super: resume; gated when budget_exhausted)
//   paused          → pending_review     (brand_admin: resume — re-review required)
//   draft           → pending_review     (brand_admin update workflow)
//
// Rejected is terminal: brand_admin opens a new campaign. The rejected
// row stays for forensics. Auto-pause from budget cron does not lock
// resume — super_admin can raise the budget then resume.

#[derive(Deserialize)]
struct StatusActionBody {
    /// Optional free-form note. Used by reject (reason) and pause.
    reason: Option<String>,
}

async fn submit_for_review(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    let (brand_id, status) = fetch_campaign_brand_status(&state.db, id).await?;
    ctx.require_brand_scope(brand_id)?;

    if !matches!(status.as_str(), "draft" | "paused" | "rejected") {
        return Err(AppError::BadRequest(format!(
            "cannot submit from status '{status}'"
        )));
    }

    // T0.4 sanity check — if pricing_model=cpm/cpc, super must have
    // set unit_price+total_budget before review. Don't waste reviewer
    // time on an unpriced campaign.
    let pricing: Option<(Option<String>, Option<i32>, Option<i64>)> = sqlx::query_as(
        "SELECT pricing_model, unit_price_cents, total_budget_cents \
         FROM ad_campaigns WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;
    if let Some((Some(model), unit, budget)) = pricing {
        if (model == "cpm" || model == "cpc") && (unit.is_none() || budget.is_none()) {
            return Err(AppError::BadRequest(
                "pricing_model requires unit_price_cents and total_budget_cents \
                 to be set by super_admin before submission"
                    .to_string(),
            ));
        }
    }

    sqlx::query(
        r#"
        UPDATE ad_campaigns
        SET status = 'pending_review',
            paused_reason = NULL,
            is_active = FALSE,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    sync_badge_status_from_campaign(&state.db, id, "pending_review").await;

    write_audit(
        &state.db,
        &ctx,
        "campaign_submit_for_review",
        Some("campaign"),
        Some(id),
        Some(brand_id),
        Some(json!({ "before": { "status": status } })),
    )
    .await;

    notify_super_admins(
        &state.db,
        "campaign_submitted",
        "Yeni kampanya inceleme bekliyor",
        &format!("Brand kampanya {} inceleme kuyruğuna alındı.", id),
        json!({ "campaign_id": id, "brand_id": brand_id }),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "status": "pending_review" },
        "error": null
    })))
}

async fn approve_campaign(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let (brand_id, status) = fetch_campaign_brand_status(&state.db, id).await?;
    if status != "pending_review" {
        return Err(AppError::BadRequest(format!(
            "can only approve from pending_review (got '{status}')"
        )));
    }

    // T0.4 — pricing fields must be set for cpm/cpc (DB CHECK also
    // enforces, but we 400 early with a clear message).
    let pricing: (Option<String>, Option<i32>, Option<i64>) = sqlx::query_as(
        "SELECT pricing_model, unit_price_cents, total_budget_cents \
         FROM ad_campaigns WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    if let Some(model) = &pricing.0 {
        if (model == "cpm" || model == "cpc") && (pricing.1.is_none() || pricing.2.is_none()) {
            return Err(AppError::BadRequest(
                "cpm/cpc campaign requires unit_price_cents and total_budget_cents".to_string(),
            ));
        }
    }

    sqlx::query(
        r#"
        UPDATE ad_campaigns
        SET status = 'active',
            paused_reason = NULL,
            is_active = TRUE,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    sync_badge_status_from_campaign(&state.db, id, "active").await;
    // forum_thread placement onaylandığında gerçek bir forum_topics
    // satırı oluştur — sponsorlu, pinned, ad_campaigns'e bağlı.
    // Kullanıcı normal topic gibi açıp yorum yapabilir.
    ensure_sponsored_forum_topic(&state.db, id).await;

    write_audit(
        &state.db,
        &ctx,
        "campaign_approve",
        Some("campaign"),
        Some(id),
        Some(brand_id),
        Some(json!({ "from": "pending_review", "to": "active" })),
    )
    .await;

    notify_brand_admins(
        &state.db,
        brand_id,
        "campaign_approved",
        "Kampanyanız onaylandı",
        &format!("Kampanya {} canlıya alındı.", id),
        json!({ "campaign_id": id }),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "status": "active" },
        "error": null
    })))
}

async fn reject_campaign(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
    Json(body): Json<StatusActionBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let (brand_id, status) = fetch_campaign_brand_status(&state.db, id).await?;
    if status != "pending_review" {
        return Err(AppError::BadRequest(format!(
            "can only reject from pending_review (got '{status}')"
        )));
    }

    let reason = body
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("No reason provided")
        .to_string();

    sqlx::query(
        r#"
        UPDATE ad_campaigns
        SET status = 'rejected',
            paused_reason = NULL,
            is_active = FALSE,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    sync_badge_status_from_campaign(&state.db, id, "rejected").await;

    write_audit(
        &state.db,
        &ctx,
        "campaign_reject",
        Some("campaign"),
        Some(id),
        Some(brand_id),
        Some(json!({ "reason": reason })),
    )
    .await;

    notify_brand_admins(
        &state.db,
        brand_id,
        "campaign_rejected",
        "Kampanyanız reddedildi",
        &format!("Kampanya {} reddedildi. Sebep: {}", id, reason),
        json!({ "campaign_id": id, "reason": reason }),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "status": "rejected", "reason": reason },
        "error": null
    })))
}

async fn resume_campaign(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let row: (Uuid, String, Option<String>, Option<i64>, i64) = sqlx::query_as(
        "SELECT brand_id, status, paused_reason, total_budget_cents, spent_cents \
         FROM ad_campaigns WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("campaign {id} not found")))?;
    let (brand_id, status, paused_reason, total_budget_cents, spent_cents) = row;
    ctx.require_brand_scope(brand_id)?;

    if status != "paused" {
        return Err(AppError::BadRequest(format!(
            "can only resume from paused (got '{status}')"
        )));
    }

    // T0.4 — budget gate. If paused by the budget aggregator,
    // resume is rejected until super raises total_budget_cents.
    if paused_reason.as_deref() == Some("budget_exhausted") {
        return Err(AppError::BadRequest(format!(
            "budget exhausted — spent {} / budget {} kr. Raise total_budget_cents first.",
            spent_cents,
            total_budget_cents.unwrap_or(0)
        )));
    }

    let effective_role = ctx.effective_role();
    let new_status = if effective_role == AdminRole::Super {
        "active"
    } else {
        // brand_admin (and super impersonating) must re-enter review
        "pending_review"
    };

    sqlx::query(
        r#"
        UPDATE ad_campaigns
        SET status = $2,
            paused_reason = NULL,
            is_active = ($2 = 'active'),
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(new_status)
    .execute(&state.db)
    .await?;

    sync_badge_status_from_campaign(&state.db, id, new_status).await;

    write_audit(
        &state.db,
        &ctx,
        "campaign_resume",
        Some("campaign"),
        Some(id),
        Some(brand_id),
        Some(json!({ "from": "paused", "to": new_status })),
    )
    .await;

    if new_status == "pending_review" {
        notify_super_admins(
            &state.db,
            "campaign_submitted",
            "Pause edilmiş kampanya yeniden incelemeye girdi",
            &format!("Kampanya {} resume edildi ve onay bekliyor.", id),
            json!({ "campaign_id": id, "brand_id": brand_id }),
        )
        .await;
    }

    Ok(Json(json!({
        "success": true,
        "data": { "id": id, "status": new_status },
        "error": null
    })))
}

// ════════════════════════════════════════════════════════════════
// APPROVAL QUEUE (T3.4)
// ════════════════════════════════════════════════════════════════

async fn list_pending_review(
    State(state): State<AppState>,
    ctx: AdminContext,
) -> Result<Json<Value>, AppError> {
    ctx.require_super()?;
    ctx.require_password_changed()?;

    let rows = sqlx::query_as::<_, CampaignRow>(
        r#"
        SELECT
            c.id, c.brand_id, c.brand_name, c.placement_key, c.creative, c.click_url,
            c.target_segment, c.starts_at, c.ends_at, c.weight,
            c.status, c.is_active, c.is_dry_run, c.deleted_at,
            c.pricing_model, c.unit_price_cents, c.total_budget_cents,
            c.target_impressions, c.duration_months,
            c.spent_cents, c.paused_reason,
            c.created_at, c.updated_at,
            COALESCE((SELECT SUM(impressions) FROM ad_metrics m WHERE m.campaign_id = c.id), 0)::bigint AS impressions_total,
            COALESCE((SELECT SUM(clicks)      FROM ad_metrics m WHERE m.campaign_id = c.id), 0)::bigint AS clicks_total
        FROM ad_campaigns c
        WHERE c.status = 'pending_review'
          AND c.deleted_at IS NULL
        ORDER BY c.updated_at DESC, c.created_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    let queue: Vec<Value> = rows.into_iter().map(campaign_row_to_json).collect();

    Ok(Json(json!({
        "success": true,
        "data": queue,
        "error": null
    })))
}

// ── Helpers ──────────────────────────────────────────────────

async fn fetch_campaign_brand_status(db: &PgPool, id: Uuid) -> Result<(Uuid, String), AppError> {
    sqlx::query_as::<_, (Uuid, String)>(
        "SELECT brand_id, status FROM ad_campaigns WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("campaign {id} not found")))
}

// T3.5 — admin_notifications inserts.
//
// Notifications are insert-only here; admin_notifications GET/mark-read
// endpoints live in a thin notifications handler (added below the
// audit handler in this file or in a future admin_notifications.rs).

async fn notify_super_admins(
    db: &PgPool,
    type_: &str,
    title: &str,
    body: &str,
    payload: Value,
) {
    let _ = sqlx::query(
        r#"
        INSERT INTO admin_notifications
            (admin_user_id, type, title, body, payload)
        SELECT id, $1, $2, $3, $4
        FROM admin_users
        WHERE role = 'super_admin' AND is_active = TRUE
        "#,
    )
    .bind(type_)
    .bind(title)
    .bind(body)
    .bind(payload)
    .execute(db)
    .await;
}

async fn notify_brand_admins(
    db: &PgPool,
    brand_id: Uuid,
    type_: &str,
    title: &str,
    body: &str,
    payload: Value,
) {
    let _ = sqlx::query(
        r#"
        INSERT INTO admin_notifications
            (admin_user_id, type, title, body, payload)
        SELECT id, $2, $3, $4, $5
        FROM admin_users
        WHERE role = 'brand_admin'
          AND brand_id = $1
          AND is_active = TRUE
        "#,
    )
    .bind(brand_id)
    .bind(type_)
    .bind(title)
    .bind(body)
    .bind(payload)
    .execute(db)
    .await;
}

// ════════════════════════════════════════════════════════════════
// AUDIT LOG  (T2.7 — brand-scoped)
// ════════════════════════════════════════════════════════════════

// ── Campaign extension (BRAND_BALANCE_PLAN §5.3) ──────────────
//
// "Tier = commitment rate" modeli: brand kampanyayı bir tier'de
// (1/3/6/12 ay) açtığında o tier'in CPM'ine kilitleniyor. Uzatma yalnız
// **ek impression** ekler; süre değişmez, fiyat kampanyanın orijinal
// `unit_price_cents` snapshot'ından kullanılır — brand'in zaten ödediği
// takvim hakkı tekrar ücretlendirilmez.
//
// Yeni süre/yeni paket gerekirse brand "Yeni Kampanya" ile o anki tier
// fiyatından fresh purchase yapar (ayrı endpoint).
//
// completed/rejected/cancelled kampanyalar uzatılamaz.

#[derive(Deserialize)]
struct ExtendCampaignBody {
    extra_impressions: i32,
    description: Option<String>,
}

async fn extend_campaign(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(id): Path<Uuid>,
    Json(body): Json<ExtendCampaignBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    if body.extra_impressions <= 0 {
        return Err(AppError::BadRequest("extra_impressions must be > 0".into()));
    }

    let brand_id = fetch_campaign_brand(&state.db, id).await?;
    ctx.require_brand_scope(brand_id)?;

    let mut tx = state.db.begin().await?;

    let row: Option<(
        String,                       // status
        Option<String>,               // paused_reason
        Option<DateTime<Utc>>,        // deleted_at
        DateTime<Utc>,                // ends_at (gösterim için, değişmez)
        Option<i32>,                  // target_impressions
        Option<i64>,                  // total_budget_cents
        Option<i32>,                  // unit_price_cents (kampanyaya kilitli tier CPM'i)
    )> = sqlx::query_as(
        r#"
        SELECT status, paused_reason, deleted_at,
               ends_at, target_impressions, total_budget_cents, unit_price_cents
        FROM ad_campaigns
        WHERE id = $1
        FOR UPDATE
        "#,
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;

    let (status, paused_reason, deleted_at, ends_at, target_imp, total_budget, unit_price_opt) =
        row.ok_or_else(|| AppError::NotFound(format!("campaign {id} not found")))?;

    if deleted_at.is_some() {
        return Err(AppError::BadRequest("campaign_deleted".into()));
    }
    if status == "rejected" || status == "completed" {
        return Err(AppError::BadRequest(format!(
            "cannot extend from status '{status}'"
        )));
    }

    // Kampanyanın orijinal tier CPM'i — uzatmada bu kullanılır, fresh
    // placement_pricing lookup yapılmaz. Brand'in commitment rate'i bu.
    let unit_price_cents = unit_price_opt.ok_or_else(|| {
        AppError::BadRequest(
            "campaign has no locked unit_price_cents (legacy?); cannot extend".into(),
        )
    })?;

    let raw_cost: i64 =
        ceil_div_1000(body.extra_impressions as i64 * unit_price_cents as i64);
    let extra_cost_cents = round_up_to_100_tl(raw_cost);

    // Brand balance lock + check
    let current_balance: Option<i64> = sqlx::query_scalar(
        "SELECT balance_cents FROM brands WHERE id = $1 FOR UPDATE",
    )
    .bind(brand_id)
    .fetch_optional(&mut *tx)
    .await?;
    let current_balance = current_balance
        .ok_or_else(|| AppError::NotFound(format!("brand {brand_id} not found")))?;

    if current_balance < extra_cost_cents {
        return Err(AppError::BadRequest(format!(
            "insufficient_balance: need {} cents, have {}",
            extra_cost_cents, current_balance
        )));
    }
    let new_balance = current_balance - extra_cost_cents;
    sqlx::query("UPDATE brands SET balance_cents = $1, updated_at = NOW() WHERE id = $2")
        .bind(new_balance)
        .bind(brand_id)
        .execute(&mut *tx)
        .await?;

    // ends_at değişmez — brand zaten takvim hakkı satın aldı.
    let new_target = target_imp.unwrap_or(0) + body.extra_impressions;
    let new_budget = total_budget.unwrap_or(0) + extra_cost_cents;

    // pause_reason='impression_cap_reached' ise resume; diğer pause sebepleri
    // (manual_brand/manual_super/budget_exhausted) extend ile resume olmaz.
    let resumed = paused_reason.as_deref() == Some("impression_cap_reached");

    if resumed {
        sqlx::query(
            r#"
            UPDATE ad_campaigns
            SET target_impressions = $1, total_budget_cents = $2,
                status = 'active', paused_reason = NULL,
                is_active = TRUE, updated_at = NOW()
            WHERE id = $3
            "#,
        )
        .bind(new_target)
        .bind(new_budget)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            UPDATE ad_campaigns
            SET target_impressions = $1, total_budget_cents = $2,
                updated_at = NOW()
            WHERE id = $3
            "#,
        )
        .bind(new_target)
        .bind(new_budget)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }

    let actor = actor_label_for(&ctx);
    let desc = body.description.clone().unwrap_or_else(|| {
        format!(
            "+{} imp @ {} cents/1k (locked tier)",
            body.extra_impressions, unit_price_cents
        )
    });
    sqlx::query(
        r#"
        INSERT INTO brand_wallet_transactions
            (brand_id, kind, amount_cents, balance_after_cents,
             ref_kind, ref_id, description,
             admin_user_id, actor_label, impersonating_brand_id)
        VALUES ($1, 'extend', $2, $3, 'campaign', $4, $5, $6, $7, $8)
        "#,
    )
    .bind(brand_id)
    .bind(-extra_cost_cents)
    .bind(new_balance)
    .bind(id)
    .bind(&desc)
    .bind(ctx.admin_user_id)
    .bind(&actor)
    .bind(ctx.impersonating_brand_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    write_audit(
        &state.db,
        &ctx,
        "campaign_extend",
        Some("campaign"),
        Some(id),
        Some(brand_id),
        Some(json!({
            "extra_impressions": body.extra_impressions,
            "extra_cost_cents": extra_cost_cents,
            "unit_price_cents": unit_price_cents,
            "new_target_impressions": new_target,
            "resumed_from_cap_reached": resumed,
        })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": {
            "campaign_id": id,
            "ends_at": ends_at,
            "new_target_impressions": new_target,
            "new_total_budget_cents": new_budget,
            "extra_cost_cents": extra_cost_cents,
            "balance_after_cents": new_balance,
            "resumed_from_cap_reached": resumed,
        },
        "error": null
    })))
}

#[derive(Deserialize)]
struct AuditQuery {
    target_kind: Option<String>,
    target_id: Option<Uuid>,
    action: Option<String>,
    since: Option<DateTime<Utc>>,
    until: Option<DateTime<Utc>>,
    limit: Option<i64>,
}

async fn list_audit_log(
    State(state): State<AppState>,
    ctx: AdminContext,
    Query(q): Query<AuditQuery>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let limit = q.limit.unwrap_or(100).clamp(1, 500);

    // Brand-scoped filter: super sees all unless impersonating;
    // brand_admin restricted to ad_audit_log.brand_id = scope.
    let scope = ctx.brand_scope();

    let rows = sqlx::query_as::<_, (
        Uuid,
        String,
        String,
        Option<Uuid>,
        Option<String>,
        Option<Value>,
        Option<Uuid>,
        Option<Uuid>,
        Option<Uuid>,
        DateTime<Utc>,
    )>(
        r#"
        SELECT id, actor, action, target_id, target_kind, diff,
               admin_user_id, impersonating_brand_id, brand_id, created_at
        FROM ad_audit_log
        WHERE ($1::uuid IS NULL OR brand_id = $1)
          AND ($2::varchar IS NULL OR target_kind = $2)
          AND ($3::uuid    IS NULL OR target_id   = $3)
          AND ($4::varchar IS NULL OR action      = $4)
          AND ($5::timestamptz IS NULL OR created_at >= $5)
          AND ($6::timestamptz IS NULL OR created_at <  $6)
        ORDER BY created_at DESC
        LIMIT $7
        "#,
    )
    .bind(scope)
    .bind(q.target_kind.as_deref())
    .bind(q.target_id)
    .bind(q.action.as_deref())
    .bind(q.since)
    .bind(q.until)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let entries: Vec<Value> = rows
        .into_iter()
        .map(|r| json!({
            "id": r.0,
            "actor": r.1,
            "action": r.2,
            "target_id": r.3,
            "target_kind": r.4,
            "diff": r.5,
            "admin_user_id": r.6,
            "impersonating_brand_id": r.7,
            "brand_id": r.8,
            "created_at": r.9,
        }))
        .collect();

    Ok(Json(json!({ "success": true, "data": entries, "error": null })))
}

// ════════════════════════════════════════════════════════════════
// CREATIVE UPLOAD
// ════════════════════════════════════════════════════════════════

async fn upload_creative(
    State(_state): State<AppState>,
    ctx: AdminContext,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {e}")))?
    {
        let filename = field
            .file_name()
            .map(|f| f.to_string())
            .unwrap_or_else(|| format!("{}.png", Uuid::new_v4()));

        // Sadece görsel veya video kabul ediyoruz. content_type
        // multipart header'ından geliyor (browser set eder, defense-
        // in-depth için ayrıca uzantı bazlı whitelist da var).
        let content_type = field
            .content_type()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let is_image = content_type.starts_with("image/");
        let is_video = matches!(content_type.as_str(), "video/mp4" | "video/webm");
        if !is_image && !is_video {
            return Err(AppError::BadRequest(format!(
                "Desteklenmeyen tip: {content_type} — sadece image/* veya video/mp4|webm"
            )));
        }

        let safe_name = format!(
            "{}_{}",
            chrono::Utc::now().timestamp_millis(),
            filename.replace(
                |c: char| !c.is_alphanumeric() && c != '.' && c != '-' && c != '_',
                "_"
            )
        );

        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(format!("Read error: {e}")))?;

        // Boyut limiti: görsel 10MB, video 50MB. Yüklenebilen en
        // büyük dosya bu — disk şişmesini ve TLS handshake'i koruma.
        let max_bytes = if is_video { 50 * 1024 * 1024 } else { 10 * 1024 * 1024 };
        if data.len() > max_bytes {
            return Err(AppError::BadRequest(format!(
                "Dosya çok büyük: {} bytes — limit {} bytes",
                data.len(),
                max_bytes
            )));
        }

        tokio::fs::create_dir_all("uploads/ads")
            .await
            .map_err(|e| AppError::Internal(format!("Dir create error: {e}")))?;

        let path = format!("uploads/ads/{safe_name}");
        tokio::fs::write(&path, &data)
            .await
            .map_err(|e| AppError::Internal(format!("Write error: {e}")))?;

        let url = format!("/uploads/ads/{safe_name}");

        return Ok(Json(json!({
            "success": true,
            "data": { "url": url, "filename": safe_name },
            "error": null
        })));
    }

    Err(AppError::BadRequest("No file provided".to_string()))
}
