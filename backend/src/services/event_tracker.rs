// Anonymous event tracker.
//
// Per-request `track_event` increments a Redis hash. The hash is
// drained hourly into the `event_counters` table by the cron in
// `main.rs`. NEVER persists user identifiers anywhere — neither in
// Redis nor in Postgres.
//
// Field encoding: "{YYYY-MM-DD}|{event_type}|{city_id_or_dash}".
// We pack date into the field so a single hot key buffers events
// crossing day boundaries safely; the drain step parses them out.

use chrono::{NaiveDate, Utc};
use redis::AsyncCommands;
use sqlx::PgPool;

const HOT_KEY: &str = "analytics:events:hot";

/// Best-effort fire-and-forget event increment. Errors are logged
/// but never propagated to request handlers — analytics must never
/// break user-facing flows.
pub async fn track_event(
    redis: &mut redis::aio::ConnectionManager,
    event_type: &str,
    city_id: Option<i32>,
) {
    let date = Utc::now().date_naive();
    let field = encode_field(date, event_type, city_id);

    if let Err(e) = redis.hincr::<_, _, i64, i64>(HOT_KEY, &field, 1).await {
        tracing::warn!("event_tracker hincr failed (event={event_type}): {e}");
    }
}

/// Drain the hot Redis hash into `event_counters`. Atomically renames
/// the hot key to a private drain key first so concurrent writes
/// continue against a fresh empty hash.
///
/// Called hourly from `main.rs`. Idempotent: an empty hot key is a
/// no-op. UPSERTs use the unique (date, event_type, city_id) index.
pub async fn drain(
    redis: &mut redis::aio::ConnectionManager,
    db: &PgPool,
) -> anyhow::Result<usize> {
    let drain_key = format!("analytics:events:drain:{}", Utc::now().timestamp());

    // Atomic rotation: RENAME fails if HOT_KEY does not exist, which
    // is the "nothing to drain" case.
    let renamed: Result<(), redis::RedisError> =
        redis.rename(HOT_KEY, &drain_key).await;
    if let Err(e) = renamed {
        // ERR no such key is normal when no events were tracked.
        if e.to_string().contains("no such key") {
            return Ok(0);
        }
        return Err(anyhow::anyhow!("rename failed: {e}"));
    }

    let entries: Vec<(String, i64)> = redis.hgetall(&drain_key).await?;

    let mut written = 0usize;
    for (field, count) in entries {
        let Some((date, event_type, city_id)) = decode_field(&field) else {
            tracing::warn!("event_tracker skipping malformed field: {field}");
            continue;
        };
        sqlx::query(
            r#"
            INSERT INTO event_counters (date, event_type, city_id, count)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (date, event_type, city_id) DO UPDATE SET
                count = event_counters.count + EXCLUDED.count
            "#,
        )
        .bind(date)
        .bind(&event_type)
        .bind(city_id)
        .bind(count)
        .execute(db)
        .await?;
        written += 1;
    }

    let _: () = redis.del(&drain_key).await.unwrap_or(());
    Ok(written)
}

fn encode_field(date: NaiveDate, event_type: &str, city_id: Option<i32>) -> String {
    let city = city_id.map(|c| c.to_string()).unwrap_or_else(|| "-".to_string());
    format!("{date}|{event_type}|{city}")
}

fn decode_field(field: &str) -> Option<(NaiveDate, String, Option<i32>)> {
    let mut parts = field.splitn(3, '|');
    let date_str = parts.next()?;
    let event_type = parts.next()?;
    let city_str = parts.next()?;

    let date = NaiveDate::parse_from_str(date_str, "%Y-%m-%d").ok()?;
    let city_id = if city_str == "-" {
        None
    } else {
        Some(city_str.parse::<i32>().ok()?)
    };
    Some((date, event_type.to_string(), city_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_decode_roundtrip_with_city() {
        let date = NaiveDate::from_ymd_opt(2026, 5, 9).unwrap();
        let f = encode_field(date, "date_create", Some(42));
        let (d, e, c) = decode_field(&f).unwrap();
        assert_eq!(d, date);
        assert_eq!(e, "date_create");
        assert_eq!(c, Some(42));
    }

    #[test]
    fn encode_decode_roundtrip_without_city() {
        let date = NaiveDate::from_ymd_opt(2026, 1, 31).unwrap();
        let f = encode_field(date, "app_open", None);
        assert_eq!(f, "2026-01-31|app_open|-");
        let (d, e, c) = decode_field(&f).unwrap();
        assert_eq!(d, date);
        assert_eq!(e, "app_open");
        assert_eq!(c, None);
    }

    #[test]
    fn decode_handles_event_type_with_underscore() {
        let f = "2026-05-09|forum_view|-";
        let (_, e, _) = decode_field(f).unwrap();
        assert_eq!(e, "forum_view");
    }

    #[test]
    fn decode_rejects_garbage() {
        assert!(decode_field("nope").is_none());
        assert!(decode_field("2026-99-99|x|-").is_none());
    }
}
