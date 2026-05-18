// Impression cap enforcer — günlük çalışan cron.
//
// Aktif kampanyaları tarar; ad_metrics'teki gerçek impression sayısı
// target_impressions'a ulaşmışsa kampanyayı pause atar
// (paused_reason='impression_cap_reached'). Brand inbox'a bildirim
// ve audit log entry'si üretir.
//
// Gün içinde cap aşılırsa yayın devam eder (ad_serving handler'ı target
// kontrolü yapmaz); fazlasını platform üstlenir. Ertesi günkü tick'te
// pause atılır.
//
// Heartbeat ve health log:
//   * Başarılı tick sonunda Redis `cap_enforcer:last_run` set edilir
//     (25 saat TTL).
//   * Status değişimleri (first_run / recovered / error) cron_health_log
//     tablosuna yazılır.

use chrono::{Datelike, Timelike, Utc};
use redis::AsyncCommands;
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::AppState;

const LOCK_KEY: &str = "cap_enforcer:lock";
const LOCK_TTL_SECS: i64 = 600; // 10 min
const HEARTBEAT_KEY: &str = "cap_enforcer:last_run";
const HEARTBEAT_TTL_SECS: i64 = 25 * 3600; // 25 saat
const LAST_HEALTH_STATUS_KEY: &str = "cap_enforcer:last_health_status";
const CRON_NAME: &str = "impression_cap_enforcer";

#[derive(Default, Debug)]
pub struct RunSummary {
    pub processed: usize,
    pub paused: usize,
}

pub async fn run_once(state: &AppState) -> Result<RunSummary, sqlx::Error> {
    let mut redis = state.redis.clone();

    // ── 1. Leader lock ────────────────────────────────────────
    let acquired: bool = redis
        .set_nx::<_, _, bool>(LOCK_KEY, "1")
        .await
        .unwrap_or(true);
    if !acquired {
        tracing::debug!("impression_cap_enforcer: lock held, skipping");
        return Ok(RunSummary::default());
    }
    let _: Result<bool, _> = redis.expire(LOCK_KEY, LOCK_TTL_SECS).await;

    // ── 2. Önceki health status (recovered olayı için) ────────
    let prev_status: Option<String> = redis.get(LAST_HEALTH_STATUS_KEY).await.ok();

    // ── 3. Aktif kampanyaları tara ────────────────────────────
    let active: Vec<(Uuid, Uuid, i32)> = sqlx::query_as(
        r#"
        SELECT id, brand_id, target_impressions
        FROM ad_campaigns
        WHERE status = 'active'
          AND deleted_at IS NULL
          AND target_impressions IS NOT NULL
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    let mut summary = RunSummary {
        processed: active.len(),
        ..Default::default()
    };

    let mut tick_error: Option<String> = None;

    for (campaign_id, brand_id, target) in active {
        if let Err(e) = process_campaign(&state.db, campaign_id, brand_id, target).await {
            tracing::error!(
                campaign_id = %campaign_id,
                error = %e,
                "impression_cap_enforcer: per-campaign error"
            );
            tick_error.get_or_insert_with(|| format!("{e}"));
        } else {
            // process_campaign Ok(true) dönerse paused. Şu an döndürmüyor;
            // basit tutmak için ayrı sayalım.
            let was_paused: bool = sqlx::query_scalar(
                "SELECT status = 'paused' FROM ad_campaigns WHERE id = $1",
            )
            .bind(campaign_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(false);
            if was_paused {
                summary.paused += 1;
            }
        }
    }

    // ── 4. Heartbeat + health log ─────────────────────────────
    let now = Utc::now();
    let now_iso = now.to_rfc3339();
    let _: Result<(), _> = redis
        .set_ex(HEARTBEAT_KEY, now_iso.clone(), HEARTBEAT_TTL_SECS as u64)
        .await;

    let new_status = if tick_error.is_some() { "error" } else { "ok" };
    let prev = prev_status.as_deref();

    let log_event: Option<(&str, String)> = match (prev, new_status) {
        (None, _) => Some(("ok", "first run".to_string())),
        (Some("stale_observed"), "ok") => Some(("recovered", "tick after stale period".to_string())),
        (_, "error") => Some((
            "error",
            tick_error.clone().unwrap_or_else(|| "unknown".into()),
        )),
        _ => None, // 'ok' her tick'te yazılmaz — log gürültüsü
    };

    if let Some((event, detail)) = log_event {
        let _ = sqlx::query(
            "INSERT INTO cron_health_log (cron_name, event, detail) VALUES ($1, $2, $3)",
        )
        .bind(CRON_NAME)
        .bind(event)
        .bind(detail)
        .execute(&state.db)
        .await;
    }

    let _: Result<(), _> = redis
        .set(LAST_HEALTH_STATUS_KEY, new_status)
        .await;

    // Release lock erken — sonraki tick beklemesin.
    let _: Result<i64, _> = redis.del(LOCK_KEY).await;

    tracing::info!(
        processed = summary.processed,
        paused = summary.paused,
        "impression_cap_enforcer: tick complete"
    );

    Ok(summary)
}

async fn process_campaign(
    db: &PgPool,
    campaign_id: Uuid,
    brand_id: Uuid,
    target: i32,
) -> Result<(), sqlx::Error> {
    let actual: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(impressions), 0)::bigint \
         FROM ad_metrics WHERE campaign_id = $1",
    )
    .bind(campaign_id)
    .fetch_one(db)
    .await?;

    if actual < target as i64 {
        return Ok(());
    }

    let mut tx = db.begin().await?;

    let affected = sqlx::query(
        r#"
        UPDATE ad_campaigns
        SET status = 'paused',
            paused_reason = 'impression_cap_reached',
            is_active = FALSE,
            updated_at = NOW()
        WHERE id = $1 AND status = 'active'
        "#,
    )
    .bind(campaign_id)
    .execute(&mut *tx)
    .await?;

    if affected.rows_affected() == 0 {
        // Başka bir tick / handler önce pause etti — atla.
        tx.rollback().await?;
        return Ok(());
    }

    sqlx::query(
        r#"
        INSERT INTO ad_audit_log
            (actor, action, target_kind, target_id, diff, brand_id)
        VALUES ('system:impression_cap_enforcer', 'campaign_auto_pause',
                'campaign', $1, $2, $3)
        "#,
    )
    .bind(campaign_id)
    .bind(json!({
        "reason": "impression_cap_reached",
        "actual_impressions": actual,
        "target_impressions": target,
    }))
    .bind(brand_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO admin_notifications
            (admin_user_id, type, title, body, payload)
        SELECT id, 'campaign_auto_paused_impression_cap',
               'Kampanya hedef gösterime ulaştı',
               'Kampanya hedef impression sayısına ulaştı ve durduruldu. Uzatmak için yönetim panelini kullanın.',
               $2
        FROM admin_users
        WHERE role = 'brand_admin'
          AND brand_id = $1
          AND is_active = TRUE
        "#,
    )
    .bind(brand_id)
    .bind(json!({
        "campaign_id": campaign_id,
        "actual_impressions": actual,
        "target_impressions": target,
    }))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

/// Günlük tick loop. main.rs'ten `tokio::spawn` ile başlatılır.
/// Env `IMPRESSION_CAP_CHECK_HOUR_UTC=3` (0-23) ile günlük çalışma saati
/// seçilir. Her 10 dakikada bir uyanır, hedef saate ulaşmış ve bugün
/// henüz çalışmamışsa `run_once` çağırır.
pub fn spawn(state: AppState) {
    let target_hour: u32 = std::env::var("IMPRESSION_CAP_CHECK_HOUR_UTC")
        .ok()
        .and_then(|v| v.parse().ok())
        .filter(|h| *h < 24)
        .unwrap_or(3);

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(600));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        let mut last_run_date: Option<chrono::NaiveDate> = None;

        loop {
            ticker.tick().await;
            let now = Utc::now();
            let today = now.date_naive();

            if now.hour() >= target_hour && last_run_date != Some(today) {
                match run_once(&state).await {
                    Ok(_) => {
                        last_run_date = Some(today);
                    }
                    Err(e) => {
                        tracing::error!("impression_cap_enforcer tick failed: {e}");
                    }
                }
            }

            // Yeni gün başladığında (UTC 00:00 sonrası) last_run_date'i sıfırla
            // ki o günkü ilk fırsat yakalansın. day() değişimi bunu işaretler.
            if let Some(prev) = last_run_date {
                if prev.day() != today.day() && now.hour() < target_hour {
                    last_run_date = None;
                }
            }
        }
    });
}
