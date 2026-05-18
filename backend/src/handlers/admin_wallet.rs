// Brand wallet endpoint'leri.
//
// Bakiye hareketleri (top-up, adjust, refund) ve cüzdan görüntüleme.
// Tüm tutarlar kuruş cinsinden bigint; 100 TL katı zorunluluğu
// `amount_cents % 10000 == 0` ile validation.
//
// Yetki matrisi:
//   GET  /brands/{id}/wallet                  → super + brand-own
//   GET  /brands/{id}/wallet/transactions     → super + brand-own
//   POST /brands/{id}/wallet/topup            → super only
//   POST /brands/{id}/wallet/adjust           → super only
//   POST /brands/{id}/wallet/refund           → super only
//
// Tüm mutation'lar ad_audit_log'a `balance_*` action ile yazılır.

use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::error::AppError;
use crate::handlers::admin_brands::write_audit;
use crate::middleware::admin_context::AdminContext;
use crate::AppState;
use sqlx::PgPool;

/// Brand'in aktif tüm brand_admin'lerine inbox bildirimi. Best-effort —
/// hata API response'unu etkilemez.
async fn notify_brand_admins_local(
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

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/brands/{id}/wallet", get(get_wallet))
        .route("/brands/{id}/wallet/transactions", get(list_transactions))
        .route("/brands/{id}/wallet/topup", post(post_topup))
        .route("/brands/{id}/wallet/adjust", post(post_adjust))
        .route("/brands/{id}/wallet/refund", post(post_refund))
}

// ── Validation helper ─────────────────────────────────────────

/// 100 TL katı (10000 kuruş) zorunluluğu. Sıfır da reddedilir
/// (anlamsız tx). Pozitif zorunluluğu çağıran handler'lar kontrol eder.
fn check_multiple_of_100_tl(amount_cents: i64) -> Result<(), AppError> {
    if amount_cents == 0 {
        return Err(AppError::BadRequest("amount_must_be_nonzero".into()));
    }
    if amount_cents % 10_000 != 0 {
        return Err(AppError::BadRequest(
            "amount_must_be_multiple_of_100_tl".into(),
        ));
    }
    Ok(())
}

fn actor_label_for(ctx: &AdminContext) -> String {
    match (ctx.admin_user_id, ctx.actor_name.as_deref()) {
        (Some(uid), _) => format!("admin_user:{uid}"),
        (None, Some(name)) => format!("env_super:{name}"),
        (None, None) => "env_super".to_string(),
    }
}

// ── GET /wallet ───────────────────────────────────────────────

async fn get_wallet(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(brand_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_brand_scope(brand_id)?;

    let balance_cents: Option<i64> =
        sqlx::query_scalar("SELECT balance_cents FROM brands WHERE id = $1")
            .bind(brand_id)
            .fetch_optional(&state.db)
            .await?;
    let balance_cents =
        balance_cents.ok_or_else(|| AppError::NotFound(format!("brand {brand_id} not found")))?;

    // Son 10 tx — preview
    let recent: Vec<(Uuid, String, i64, i64, Option<String>, Option<Uuid>, Option<String>, String, chrono::DateTime<chrono::Utc>)> =
        sqlx::query_as(
            r#"
            SELECT id, kind, amount_cents, balance_after_cents,
                   ref_kind, ref_id, description, actor_label, created_at
            FROM brand_wallet_transactions
            WHERE brand_id = $1
            ORDER BY created_at DESC
            LIMIT 10
            "#,
        )
        .bind(brand_id)
        .fetch_all(&state.db)
        .await?;

    let recent_json: Vec<Value> = recent
        .into_iter()
        .map(|(id, kind, amt, bal, rk, rid, desc, actor, ts)| {
            json!({
                "id": id,
                "kind": kind,
                "amount_cents": amt,
                "balance_after_cents": bal,
                "ref_kind": rk,
                "ref_id": rid,
                "description": desc,
                "actor_label": actor,
                "created_at": ts,
            })
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": {
            "brand_id": brand_id,
            "balance_cents": balance_cents,
            "recent_transactions": recent_json,
        },
        "error": null
    })))
}

// ── GET /wallet/transactions ──────────────────────────────────

#[derive(Deserialize)]
struct ListTxQuery {
    kind: Option<String>,
    ref_kind: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn list_transactions(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(brand_id): Path<Uuid>,
    Query(q): Query<ListTxQuery>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_brand_scope(brand_id)?;

    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let offset = q.offset.unwrap_or(0).max(0);

    let rows: Vec<(Uuid, String, i64, i64, Option<String>, Option<Uuid>, Option<String>, String, Option<Uuid>, Option<Uuid>, chrono::DateTime<chrono::Utc>)> =
        sqlx::query_as(
            r#"
            SELECT id, kind, amount_cents, balance_after_cents,
                   ref_kind, ref_id, description, actor_label,
                   admin_user_id, impersonating_brand_id, created_at
            FROM brand_wallet_transactions
            WHERE brand_id = $1
              AND ($2::varchar IS NULL OR kind = $2)
              AND ($3::varchar IS NULL OR ref_kind = $3)
            ORDER BY created_at DESC
            LIMIT $4 OFFSET $5
            "#,
        )
        .bind(brand_id)
        .bind(q.kind.as_deref())
        .bind(q.ref_kind.as_deref())
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await?;

    let items: Vec<Value> = rows
        .into_iter()
        .map(|(id, kind, amt, bal, rk, rid, desc, actor, auid, ibid, ts)| {
            json!({
                "id": id,
                "kind": kind,
                "amount_cents": amt,
                "balance_after_cents": bal,
                "ref_kind": rk,
                "ref_id": rid,
                "description": desc,
                "actor_label": actor,
                "admin_user_id": auid,
                "impersonating_brand_id": ibid,
                "created_at": ts,
            })
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": { "items": items, "limit": limit, "offset": offset },
        "error": null
    })))
}

// ── POST /wallet/topup ────────────────────────────────────────

#[derive(Deserialize)]
struct TopupBody {
    amount_cents: i64,
    description: String,
}

async fn post_topup(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(brand_id): Path<Uuid>,
    Json(body): Json<TopupBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_super()?;

    if body.amount_cents <= 0 {
        return Err(AppError::BadRequest("amount_must_be_positive".into()));
    }
    check_multiple_of_100_tl(body.amount_cents)?;
    if body.description.trim().is_empty() {
        return Err(AppError::BadRequest("description_required".into()));
    }

    let tx = mutate_balance(
        &state,
        &ctx,
        brand_id,
        body.amount_cents,
        "topup",
        None,
        None,
        Some(body.description.trim().to_string()),
    )
    .await?;

    write_audit(
        &state.db,
        &ctx,
        "balance_topup",
        Some("brand"),
        Some(brand_id),
        Some(brand_id),
        Some(json!({
            "amount_cents": body.amount_cents,
            "balance_after_cents": tx.balance_after_cents,
            "description": body.description,
        })),
    )
    .await;

    // Brand'in inbox'ına bildirim. UI tarafında /inbox sayfasında listelenir.
    let lira = body.amount_cents / 100;
    notify_brand_admins_local(
        &state.db,
        brand_id,
        "balance_topup",
        "Hesabınıza bakiye eklendi",
        &format!(
            "Hesabınıza {} TL eklendi. Açıklama: {}",
            lira,
            body.description.trim()
        ),
        json!({
            "amount_cents": body.amount_cents,
            "balance_after_cents": tx.balance_after_cents,
            "description": body.description,
            "tx_id": tx.id,
        }),
    )
    .await;

    Ok(Json(json!({ "success": true, "data": tx_to_json(&tx), "error": null })))
}

// ── POST /wallet/adjust ───────────────────────────────────────

#[derive(Deserialize)]
struct AdjustBody {
    amount_cents: i64,
    description: String,
}

async fn post_adjust(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(brand_id): Path<Uuid>,
    Json(body): Json<AdjustBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_super()?;

    check_multiple_of_100_tl(body.amount_cents)?;
    if body.description.trim().is_empty() {
        return Err(AppError::BadRequest("description_required".into()));
    }

    let tx = mutate_balance(
        &state,
        &ctx,
        brand_id,
        body.amount_cents,
        "adjust",
        None,
        None,
        Some(body.description.trim().to_string()),
    )
    .await?;

    write_audit(
        &state.db,
        &ctx,
        "balance_adjust",
        Some("brand"),
        Some(brand_id),
        Some(brand_id),
        Some(json!({
            "amount_cents": body.amount_cents,
            "balance_after_cents": tx.balance_after_cents,
            "description": body.description,
        })),
    )
    .await;

    Ok(Json(json!({ "success": true, "data": tx_to_json(&tx), "error": null })))
}

// ── POST /wallet/refund ───────────────────────────────────────

#[derive(Deserialize)]
struct RefundBody {
    amount_cents: i64,
    campaign_id: Option<Uuid>,
    description: String,
}

async fn post_refund(
    State(state): State<AppState>,
    ctx: AdminContext,
    Path(brand_id): Path<Uuid>,
    Json(body): Json<RefundBody>,
) -> Result<Json<Value>, AppError> {
    ctx.require_password_changed()?;
    ctx.require_super()?;

    if body.amount_cents <= 0 {
        return Err(AppError::BadRequest("amount_must_be_positive".into()));
    }
    check_multiple_of_100_tl(body.amount_cents)?;
    if body.description.trim().is_empty() {
        return Err(AppError::BadRequest("description_required".into()));
    }

    // Eğer campaign_id verilmişse brand'e ait olduğunu doğrula.
    if let Some(cid) = body.campaign_id {
        let owner: Option<Uuid> = sqlx::query_scalar(
            "SELECT brand_id FROM ad_campaigns WHERE id = $1",
        )
        .bind(cid)
        .fetch_optional(&state.db)
        .await?;
        match owner {
            None => return Err(AppError::NotFound("campaign_not_found".into())),
            Some(b) if b != brand_id => {
                return Err(AppError::BadRequest("campaign_brand_mismatch".into()))
            }
            _ => {}
        }
    }

    let ref_kind = body.campaign_id.map(|_| "campaign".to_string());
    let tx = mutate_balance(
        &state,
        &ctx,
        brand_id,
        body.amount_cents,
        "refund",
        ref_kind,
        body.campaign_id,
        Some(body.description.trim().to_string()),
    )
    .await?;

    write_audit(
        &state.db,
        &ctx,
        "balance_refund",
        Some("brand"),
        Some(brand_id),
        Some(brand_id),
        Some(json!({
            "amount_cents": body.amount_cents,
            "balance_after_cents": tx.balance_after_cents,
            "campaign_id": body.campaign_id,
            "description": body.description,
        })),
    )
    .await;

    Ok(Json(json!({ "success": true, "data": tx_to_json(&tx), "error": null })))
}

// ── Shared mutation helper ────────────────────────────────────

pub struct WalletTx {
    pub id: Uuid,
    pub kind: String,
    pub amount_cents: i64,
    pub balance_after_cents: i64,
    pub ref_kind: Option<String>,
    pub ref_id: Option<Uuid>,
    pub description: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

fn tx_to_json(tx: &WalletTx) -> Value {
    json!({
        "id": tx.id,
        "kind": tx.kind,
        "amount_cents": tx.amount_cents,
        "balance_after_cents": tx.balance_after_cents,
        "ref_kind": tx.ref_kind,
        "ref_id": tx.ref_id,
        "description": tx.description,
        "created_at": tx.created_at,
    })
}

/// `balance += amount_cents` (signed) ve aynı transaction'da defter satırı
/// insert eder. CHECK constraint negatif bakiyeyi engeller — yetersiz
/// olursa `balance_insufficient` döner.
///
/// purchase/extend için doğrudan bunu çağırmak yerine campaign-mutating
/// handler'lar kendi transaction'larını yazıp orada hem ad_campaigns hem
/// brands UPDATE'i + bu insert'i yapacak. Bu helper sadece "saf bakiye"
/// hareketleri için (topup/adjust/refund).
pub async fn mutate_balance(
    state: &AppState,
    ctx: &AdminContext,
    brand_id: Uuid,
    amount_cents: i64,
    kind: &str,
    ref_kind: Option<String>,
    ref_id: Option<Uuid>,
    description: Option<String>,
) -> Result<WalletTx, AppError> {
    let mut tx = state.db.begin().await?;

    // Lock brand satırı + var olduğunu doğrula
    let current: Option<i64> = sqlx::query_scalar(
        "SELECT balance_cents FROM brands WHERE id = $1 FOR UPDATE",
    )
    .bind(brand_id)
    .fetch_optional(&mut *tx)
    .await?;
    let current = current
        .ok_or_else(|| AppError::NotFound(format!("brand {brand_id} not found")))?;

    let new_balance = current
        .checked_add(amount_cents)
        .ok_or_else(|| AppError::Internal("balance overflow".into()))?;
    if new_balance < 0 {
        return Err(AppError::BadRequest("balance_insufficient".into()));
    }

    sqlx::query("UPDATE brands SET balance_cents = $1, updated_at = NOW() WHERE id = $2")
        .bind(new_balance)
        .bind(brand_id)
        .execute(&mut *tx)
        .await?;

    let actor = actor_label_for(ctx);
    let row: (Uuid, chrono::DateTime<chrono::Utc>) = sqlx::query_as(
        r#"
        INSERT INTO brand_wallet_transactions
            (brand_id, kind, amount_cents, balance_after_cents,
             ref_kind, ref_id, description,
             admin_user_id, actor_label, impersonating_brand_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, created_at
        "#,
    )
    .bind(brand_id)
    .bind(kind)
    .bind(amount_cents)
    .bind(new_balance)
    .bind(&ref_kind)
    .bind(ref_id)
    .bind(&description)
    .bind(ctx.admin_user_id)
    .bind(&actor)
    .bind(ctx.impersonating_brand_id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(WalletTx {
        id: row.0,
        kind: kind.to_string(),
        amount_cents,
        balance_after_cents: new_balance,
        ref_kind,
        ref_id,
        description,
        created_at: row.1,
    })
}
