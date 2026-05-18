// Brand wallet reconciliation — günde bir tick.
//
// `brands.balance_cents` ile `SUM(brand_wallet_transactions.amount_cents)`
// karşılaştırır. Aralarında fark varsa:
//   * tracing::error log atılır,
//   * cron_health_log'a `event='error'` ile detay yazılır,
//   * super_admin inbox'larına bildirim düşer.
//
// Tutarlıysa heartbeat tazelenir ve durum değişikliği varsa (`first_run`,
// `recovered`) tek satır log yazılır — sürekli "ok" log gürültüsü yok.
//
// Idempotent: paralel tick'ler için Redis SETNX leader-lock kullanılır.

use chrono::Utc;
use redis::AsyncCommands;
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::AppState;

pub const CRON_NAME: &str = "wallet_reconciler";
pub const LAST_RUN_KEY: &str = "wallet_reconciler:last_run";
pub const STALE_THRESHOLD_HOURS: i64 = 25;

const LOCK_KEY: &str = "wallet_reconciler:lock";
const LOCK_TTL_SECS: i64 = 600;
const HEARTBEAT_TTL_SECS: u64 = 25 * 3600;
const LAST_HEALTH_STATUS_KEY: &str = "wallet_reconciler:last_health_status";

/// Bir tick'in özet sonucu — admin trigger endpoint'i tarafından döndürülür.
#[derive(Default, Debug)]
pub struct RunSummary {
    /// Kontrol edilen brand sayısı.
    pub processed: usize,
    /// Bakiye = defter eşleşmesi sağlanan brand sayısı.
    pub matched: usize,
    /// Mismatched (sapmış) brand sayısı.
    pub mismatched: usize,
}

pub async fn run_once(state: &AppState) -> Result<RunSummary, sqlx::Error> {
    let mut redis = state.redis.clone();

    let acquired: bool = redis
        .set_nx::<_, _, bool>(LOCK_KEY, "1")
        .await
        .unwrap_or(true);
    if !acquired {
        tracing::debug!("wallet_reconciler: lock held, skipping");
        return Ok(RunSummary::default());
    }
    let _: Result<bool, _> = redis.expire(LOCK_KEY, LOCK_TTL_SECS).await;

    let prev_status: Option<String> = redis.get(LAST_HEALTH_STATUS_KEY).await.ok();

    // Tüm brand'ler — toplam tx ile join.
    let rows: Vec<(Uuid, String, i64, i64)> = sqlx::query_as(
        r#"
        SELECT b.id,
               b.display_name,
               b.balance_cents,
               COALESCE((
                   SELECT SUM(amount_cents)::bigint
                   FROM brand_wallet_transactions t
                   WHERE t.brand_id = b.id
               ), 0)
        FROM brands b
        WHERE b.is_active = TRUE
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    let mut summary = RunSummary {
        processed: rows.len(),
        ..Default::default()
    };
    let mut mismatches: Vec<(Uuid, String, i64, i64)> = Vec::new();

    for (brand_id, name, balance, ledger_sum) in rows {
        if balance == ledger_sum {
            summary.matched += 1;
        } else {
            summary.mismatched += 1;
            tracing::error!(
                brand_id = %brand_id,
                brand_name = %name,
                balance_cents = balance,
                ledger_sum_cents = ledger_sum,
                delta_cents = balance - ledger_sum,
                "wallet_reconciler: balance mismatch"
            );
            mismatches.push((brand_id, name, balance, ledger_sum));
        }
    }

    let now = Utc::now();
    let _: Result<(), _> = redis
        .set_ex(LAST_RUN_KEY, now.to_rfc3339(), HEARTBEAT_TTL_SECS)
        .await;

    let new_status = if mismatches.is_empty() { "ok" } else { "error" };
    let prev = prev_status.as_deref();

    let log_event: Option<(&str, String)> = match (prev, new_status) {
        (None, _) => Some(("ok", "first run".to_string())),
        (Some("stale_observed"), "ok") => {
            Some(("recovered", "tick after stale period".to_string()))
        }
        (_, "error") => {
            let detail = mismatches
                .iter()
                .take(5)
                .map(|(id, name, bal, sum)| {
                    format!("{name} ({id}): balance={bal} ledger={sum}")
                })
                .collect::<Vec<_>>()
                .join(" | ");
            let extra = if mismatches.len() > 5 {
                format!(" | +{} more", mismatches.len() - 5)
            } else {
                String::new()
            };
            Some(("error", format!("{} mismatch(es): {}{}", mismatches.len(), detail, extra)))
        }
        _ => None,
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

    // Sapma varsa super_admin'lere bildirim — günde bir kez (idempotency
    // log üzerinden zaten sağlandı, ama bildirimde de tekrarı önlemek için
    // bugün gönderdiysek tekrar gönderme).
    if !mismatches.is_empty() {
        let already_today: bool = sqlx::query_scalar(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM admin_notifications
                WHERE type = 'wallet_reconciliation_mismatch'
                  AND created_at::date = CURRENT_DATE
            )
            "#,
        )
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

        if !already_today {
            let _ = notify_super_admins(
                &state.db,
                "wallet_reconciliation_mismatch",
                "Cüzdan tutarsızlığı tespit edildi",
                &format!(
                    "{} brand'in bakiyesi defter toplamından sapıyor. Detay için /admin/cron-health.",
                    mismatches.len()
                ),
                json!({
                    "count": mismatches.len(),
                    "mismatches": mismatches.iter().map(|(id, name, bal, sum)| json!({
                        "brand_id": id,
                        "brand_name": name,
                        "balance_cents": bal,
                        "ledger_sum_cents": sum,
                        "delta_cents": bal - sum,
                    })).collect::<Vec<_>>(),
                }),
            )
            .await;
        }
    }

    let _: Result<(), _> = redis.set(LAST_HEALTH_STATUS_KEY, new_status).await;
    let _: Result<i64, _> = redis.del(LOCK_KEY).await;

    tracing::info!(
        processed = summary.processed,
        matched = summary.matched,
        mismatched = summary.mismatched,
        "wallet_reconciler: tick complete"
    );

    Ok(summary)
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

/// Günlük tick loop. main.rs'ten `tokio::spawn` ile başlatılır.
/// `WALLET_RECONCILE_HOUR_UTC=4` (0-23) ile çalışma saati seçilir
/// (varsayılan UTC 04:00 — impression_cap_enforcer'dan sonra).
pub fn spawn(state: AppState) {
    let target_hour: u32 = std::env::var("WALLET_RECONCILE_HOUR_UTC")
        .ok()
        .and_then(|v| v.parse().ok())
        .filter(|h| *h < 24)
        .unwrap_or(4);

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(600));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        let mut last_run_date: Option<chrono::NaiveDate> = None;

        loop {
            ticker.tick().await;
            let now = Utc::now();
            let today = now.date_naive();

            use chrono::Timelike;
            if now.hour() >= target_hour && last_run_date != Some(today) {
                match run_once(&state).await {
                    Ok(_) => {
                        last_run_date = Some(today);
                    }
                    Err(e) => {
                        tracing::error!("wallet_reconciler tick failed: {e}");
                    }
                }
            }

            use chrono::Datelike;
            if let Some(prev) = last_run_date {
                if prev.day() != today.day() && now.hour() < target_hour {
                    last_run_date = None;
                }
            }
        }
    });
}
