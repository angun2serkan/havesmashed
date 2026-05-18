// Placement pricing endpoint'leri.
//
// Super admin her placement için CPM birim fiyatını (1/3/6/12 aylık)
// tier başına tanımlar. Fiyat değişimi tarihçeli: yeni satır insert +
// eski satırın effective_to'su NOW olur (aynı placement+duration için).
// Geçmiş kampanyaların maliyeti aktivasyon anındaki fiyattan hesaplandığı
// için (`ad_campaigns.unit_price_cents` snapshot'ı) fiyat güncellemeleri
// açık kampanyaları etkilemez.

use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::error::AppError;
use crate::handlers::admin_brands::write_audit;
use crate::middleware::admin_context::AdminContext;
use crate::AppState;

/// İzin verilen ay-tier değerleri. ad_campaigns ve placement_pricing
/// CHECK constraint'leri bu kümeyi DB seviyesinde de zorluyor.
pub const ALLOWED_DURATION_MONTHS: &[i16] = &[1, 3, 6, 12];

pub fn is_allowed_duration(months: i16) -> bool {
    ALLOWED_DURATION_MONTHS.contains(&months)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/placements/{key}/pricing",
            get(get_pricing).post(post_pricing),
        )
        .route("/pricing/active", get(list_active_pricing))
}

fn actor_label_for(ctx: &AdminContext) -> String {
    match (ctx.admin_user_id, ctx.actor_name.as_deref()) {
        (Some(uid), _) => format!("admin_user:{uid}"),
        (None, Some(name)) => format!("env_super:{name}"),
        (None, None) => "env_super".to_string(),
    }
}

// ── GET /placements/{key}/pricing ─────────────────────────────

async fn get_pricing(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(key): Path<String>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_super()?;

    let rows: Vec<(
        Uuid,
        String,
        i32,
        i16,
        i32,
        chrono::DateTime<chrono::Utc>,
        Option<chrono::DateTime<chrono::Utc>>,
        String,
        Option<String>,
        chrono::DateTime<chrono::Utc>,
    )> = sqlx::query_as(
        r#"
        SELECT id, pricing_model, unit_price_cents, duration_months,
               included_impressions,
               effective_from, effective_to, actor_label, notes, created_at
        FROM placement_pricing
        WHERE placement_key = $1
        ORDER BY duration_months ASC, effective_from DESC
        LIMIT 200
        "#,
    )
    .bind(&key)
    .fetch_all(&state.db)
    .await?;

    let history: Vec<Value> = rows
        .into_iter()
        .map(|(id, model, unit, months, included, from, to, actor, notes, created)| {
            json!({
                "id": id,
                "pricing_model": model,
                "unit_price_cents": unit,
                "duration_months": months,
                "included_impressions": included,
                "effective_from": from,
                "effective_to": to,
                "actor_label": actor,
                "notes": notes,
                "created_at": created,
                "is_active": to.is_none(),
            })
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": { "placement_key": key, "history": history },
        "error": null
    })))
}

// ── POST /placements/{key}/pricing ────────────────────────────

#[derive(Deserialize)]
struct NewPricingBody {
    unit_price_cents: i32,
    /// Ay-tier: 1, 3, 6 veya 12 olmalı.
    duration_months: i16,
    /// Bu tier'in paketinde kaç impression dahil. Brand create akışında
    /// görünür ve total fiyat bundan türetilir.
    included_impressions: i32,
    notes: Option<String>,
}

async fn post_pricing(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(key): Path<String>,
    Json(body): Json<NewPricingBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_super()?;

    if body.unit_price_cents <= 0 {
        return Err(AppError::BadRequest("unit_price_must_be_positive".into()));
    }
    if !is_allowed_duration(body.duration_months) {
        return Err(AppError::BadRequest(
            "duration_months_must_be_1_3_6_or_12".into(),
        ));
    }
    if body.included_impressions <= 0 {
        return Err(AppError::BadRequest(
            "included_impressions_must_be_positive".into(),
        ));
    }

    // Placement var mı?
    let exists: Option<i32> = sqlx::query_scalar(
        "SELECT 1 FROM ad_placements WHERE key = $1",
    )
    .bind(&key)
    .fetch_optional(&state.db)
    .await?;
    if exists.is_none() {
        return Err(AppError::NotFound(format!("placement {key} not found")));
    }

    let actor = actor_label_for(&ctx);
    let mut tx = state.db.begin().await?;

    // Yalnız bu (placement, duration) tier'inin eski aktif satırını kapat.
    sqlx::query(
        r#"
        UPDATE placement_pricing
        SET effective_to = NOW()
        WHERE placement_key = $1
          AND pricing_model = 'cpm'
          AND duration_months = $2
          AND effective_to IS NULL
        "#,
    )
    .bind(&key)
    .bind(body.duration_months)
    .execute(&mut *tx)
    .await?;

    // Yeni satır
    let row: (Uuid, chrono::DateTime<chrono::Utc>) = sqlx::query_as(
        r#"
        INSERT INTO placement_pricing
            (placement_key, pricing_model, unit_price_cents, duration_months,
             included_impressions, effective_from, admin_user_id, actor_label, notes)
        VALUES ($1, 'cpm', $2, $3, $4, NOW(), $5, $6, $7)
        RETURNING id, effective_from
        "#,
    )
    .bind(&key)
    .bind(body.unit_price_cents)
    .bind(body.duration_months)
    .bind(body.included_impressions)
    .bind(ctx.admin_user_id)
    .bind(&actor)
    .bind(body.notes.as_deref())
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    write_audit(
        &state.db,
        &ctx,
        "placement_pricing_update",
        Some("placement"),
        None,
        None,
        Some(json!({
            "placement_key": key,
            "duration_months": body.duration_months,
            "new_unit_price_cents": body.unit_price_cents,
            "included_impressions": body.included_impressions,
            "notes": body.notes,
        })),
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": row.0,
            "placement_key": key,
            "pricing_model": "cpm",
            "duration_months": body.duration_months,
            "unit_price_cents": body.unit_price_cents,
            "included_impressions": body.included_impressions,
            "effective_from": row.1,
            "is_active": true,
        },
        "error": null
    })))
}

// ── GET /pricing/active ───────────────────────────────────────
// Brand admin kampanya formunda çağırır — tüm placement'ların aktif
// fiyatları. Super da görür.

async fn list_active_pricing(
    State(state): State<AppState>,
    ctx: AdminContext,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;

    let rows: Vec<(String, String, i32, i16, i32, chrono::DateTime<chrono::Utc>)> =
        sqlx::query_as(
            r#"
            SELECT placement_key, pricing_model, unit_price_cents,
                   duration_months, included_impressions, effective_from
            FROM placement_pricing
            WHERE effective_to IS NULL
            ORDER BY placement_key, duration_months
            "#,
        )
        .fetch_all(&state.db)
        .await?;

    let items: Vec<Value> = rows
        .into_iter()
        .map(|(key, model, unit, months, included, from)| {
            json!({
                "placement_key": key,
                "pricing_model": model,
                "unit_price_cents": unit,
                "duration_months": months,
                "included_impressions": included,
                "effective_from": from,
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": items, "error": null })))
}
