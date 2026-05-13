// Budget aggregator — periodic job that:
//   1. Re-computes spent_cents for every active CPM/CPC campaign from
//      ad_metrics × unit_price.
//   2. Fires threshold notifications (50/80/95) to brand_admins.
//   3. Auto-pauses campaigns at 100% with paused_reason='budget_exhausted'.
//
// Scheduling:
//   * tokio::interval(5 minutes) driven loop, spawned from main.rs.
//   * Redis SETNX leader-lock so multiple backend replicas don't
//     race on the same update.
//
// T0.4 anonymity:
//   * Reads only ad_metrics (anonymous) and ad_campaigns. Never touches
//     user-tied tables.
//
// Idempotency:
//   * `last_alert_threshold` column gates per-threshold notifications;
//     the same eşik never fires twice. When super_admin raises the
//     budget, admin_ads::update_campaign clears the threshold so future
//     50/80/95 events can re-fire.

use redis::AsyncCommands;
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

/// Threshold cascade: descending so each campaign fires at most one
/// new notification per cron tick (highest passed but not yet alerted).
const ALERT_THRESHOLDS: &[i16] = &[100, 95, 80, 50];

const LOCK_KEY: &str = "budget_aggregator:lock";
const LOCK_TTL_SECS: i64 = 600; // 10 min — generously > job runtime

#[derive(sqlx::FromRow)]
struct CampaignTrackingRow {
    id: Uuid,
    brand_id: Uuid,
    pricing_model: String,
    unit_price_cents: i32,
    total_budget_cents: i64,
    last_alert_threshold: Option<i16>,
}

#[derive(Default, Debug)]
pub struct RunSummary {
    pub processed: usize,
    pub auto_paused: usize,
    pub alerts_fired: usize,
}

/// Run one budget aggregation pass. Idempotent and safe to call from
/// either the tokio interval loop or a manual super_admin trigger.
pub async fn run_once(
    db: &PgPool,
    redis: &mut redis::aio::ConnectionManager,
) -> Result<RunSummary, sqlx::Error> {
    // ── 1. Leader lock ────────────────────────────────────────
    let acquired: bool = redis
        .set_nx::<_, _, bool>(LOCK_KEY, "1")
        .await
        .unwrap_or(true);
    if !acquired {
        tracing::debug!("budget_aggregator: lock held by another instance, skipping");
        return Ok(RunSummary::default());
    }
    let _: Result<bool, _> = redis.expire(LOCK_KEY, LOCK_TTL_SECS).await;

    // ── 2. Pull every campaign that needs spent_cents refresh ─
    let rows: Vec<CampaignTrackingRow> = sqlx::query_as(
        r#"
        SELECT id, brand_id, pricing_model, unit_price_cents,
               total_budget_cents, last_alert_threshold
        FROM ad_campaigns
        WHERE status = 'active'
          AND deleted_at IS NULL
          AND pricing_model IN ('cpm','cpc')
          AND unit_price_cents IS NOT NULL
          AND total_budget_cents IS NOT NULL
        "#,
    )
    .fetch_all(db)
    .await?;

    let mut summary = RunSummary::default();
    summary.processed = rows.len();

    for c in rows {
        if let Err(e) = process_campaign(db, &c, &mut summary).await {
            tracing::error!(
                campaign_id = %c.id,
                error = %e,
                "budget_aggregator: per-campaign error (continuing)"
            );
        }
    }

    // Release lock early so subsequent ticks don't have to wait full TTL
    let _: Result<i64, _> = redis.del(LOCK_KEY).await;

    tracing::info!(
        processed = summary.processed,
        auto_paused = summary.auto_paused,
        alerts_fired = summary.alerts_fired,
        "budget_aggregator: tick complete"
    );

    Ok(summary)
}

async fn process_campaign(
    db: &PgPool,
    c: &CampaignTrackingRow,
    summary: &mut RunSummary,
) -> Result<(), sqlx::Error> {
    // Compute spent_cents from ad_metrics.
    // CPM: clicks_or_impressions * unit_price / 1000
    // CPC: clicks * unit_price
    let spent_cents: i64 = match c.pricing_model.as_str() {
        "cpm" => {
            let imp_total: i64 = sqlx::query_scalar(
                "SELECT COALESCE(SUM(impressions), 0)::bigint \
                 FROM ad_metrics WHERE campaign_id = $1",
            )
            .bind(c.id)
            .fetch_one(db)
            .await?;
            (imp_total as i128 * c.unit_price_cents as i128 / 1000) as i64
        }
        "cpc" => {
            let click_total: i64 = sqlx::query_scalar(
                "SELECT COALESCE(SUM(clicks), 0)::bigint \
                 FROM ad_metrics WHERE campaign_id = $1",
            )
            .bind(c.id)
            .fetch_one(db)
            .await?;
            (click_total as i128 * c.unit_price_cents as i128) as i64
        }
        other => {
            tracing::warn!("unexpected pricing_model {other} for campaign {}", c.id);
            return Ok(());
        }
    };

    // Always update spent_cents (truth from metrics).
    sqlx::query("UPDATE ad_campaigns SET spent_cents = $2 WHERE id = $1")
        .bind(c.id)
        .bind(spent_cents)
        .execute(db)
        .await?;

    let progress = (spent_cents as f64 / c.total_budget_cents as f64) * 100.0;

    // Find the highest unfired threshold this run.
    let last = c.last_alert_threshold.unwrap_or(-1);
    let mut next_threshold: Option<i16> = None;
    for &t in ALERT_THRESHOLDS {
        if (progress as i64) >= t as i64 && t > last {
            next_threshold = Some(t);
            break;
        }
    }

    let Some(threshold) = next_threshold else {
        return Ok(()); // nothing to alert
    };

    summary.alerts_fired += 1;

    // ── 100%: hard auto-pause ─────────────────────────────────
    if threshold >= 100 {
        sqlx::query(
            r#"
            UPDATE ad_campaigns
            SET status = 'paused',
                paused_reason = 'budget_exhausted',
                is_active = FALSE,
                last_alert_threshold = $2,
                updated_at = NOW()
            WHERE id = $1 AND status = 'active'
            "#,
        )
        .bind(c.id)
        .bind(threshold)
        .execute(db)
        .await?;

        summary.auto_paused += 1;

        write_system_audit(
            db,
            "campaign_auto_pause",
            "campaign",
            c.id,
            c.brand_id,
            json!({
                "reason": "budget_exhausted",
                "spent_cents": spent_cents,
                "total_budget_cents": c.total_budget_cents,
                "progress_percent": progress,
            }),
        )
        .await?;

        notify_brand_admins(
            db,
            c.brand_id,
            "campaign_auto_paused_budget",
            "Kampanya bütçe aşımı nedeniyle duraklatıldı",
            &format!(
                "Kampanya bütçesi tamamen tüketildi (%{:.1}). Yayın otomatik durduruldu.",
                progress
            ),
            json!({ "campaign_id": c.id, "progress_percent": progress }),
        )
        .await?;

        // Also notify super_admins for operational visibility
        notify_super_admins(
            db,
            "campaign_auto_paused_budget",
            "Bütçesi dolan kampanya otomatik duraklatıldı",
            &format!(
                "Kampanya {} bütçesini tüketti ve durduruldu.",
                c.id
            ),
            json!({
                "campaign_id": c.id,
                "brand_id": c.brand_id,
                "progress_percent": progress,
            }),
        )
        .await?;
    } else {
        // ── 50 / 80 / 95: soft notification ───────────────────
        sqlx::query(
            "UPDATE ad_campaigns SET last_alert_threshold = $2 WHERE id = $1",
        )
        .bind(c.id)
        .bind(threshold)
        .execute(db)
        .await?;

        let alert_type = format!("budget_threshold_{threshold}");
        let title = format!("Kampanya bütçesinin %{} dolduğu eşiğine ulaşıldı", threshold);
        let body = format!(
            "Kampanyanın bütçesi %{}'in üzerinde. Mevcut harcama: {} kr / {} kr.",
            threshold,
            spent_cents,
            c.total_budget_cents
        );

        notify_brand_admins(
            db,
            c.brand_id,
            &alert_type,
            &title,
            &body,
            json!({
                "campaign_id": c.id,
                "threshold": threshold,
                "spent_cents": spent_cents,
                "total_budget_cents": c.total_budget_cents,
            }),
        )
        .await?;
    }

    Ok(())
}

async fn notify_brand_admins(
    db: &PgPool,
    brand_id: Uuid,
    type_: &str,
    title: &str,
    body: &str,
    payload: serde_json::Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
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
    .await?;
    Ok(())
}

async fn notify_super_admins(
    db: &PgPool,
    type_: &str,
    title: &str,
    body: &str,
    payload: serde_json::Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
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
    .await?;
    Ok(())
}

async fn write_system_audit(
    db: &PgPool,
    action: &str,
    target_kind: &str,
    target_id: Uuid,
    brand_id: Uuid,
    diff: serde_json::Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO ad_audit_log
            (actor, action, target_kind, target_id, diff, brand_id)
        VALUES ('system:budget_aggregator', $1, $2, $3, $4, $5)
        "#,
    )
    .bind(action)
    .bind(target_kind)
    .bind(target_id)
    .bind(diff)
    .bind(brand_id)
    .execute(db)
    .await?;
    Ok(())
}
