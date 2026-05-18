// Server-side targeting evaluator.
//
// Anonymity contract: the user profile derived here NEVER leaves
// the server. It is computed on demand, cached briefly in Redis
// (5 min TTL) under a key that contains user_id only because the
// auth context already has it — no hash, no fanout, no aggregate
// log entry. Brand only ever learns the matched campaign id, not
// who matched.

use chrono::Utc;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use std::collections::HashSet;
use uuid::Uuid;

use crate::error::AppError;

const PROFILE_CACHE_TTL_SECS: u64 = 300;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserAdProfile {
    /// Date counts over the last 30 days (drives active_dater_30d / high_frequency_30d).
    pub date_count_30d: i64,
    /// True if the user has an open `partners` row (no relationship_end).
    pub has_active_partner: bool,
    /// Distinct city_ids the user has ever logged a date in.
    pub city_ids: Vec<i32>,
    /// Distinct partner age_ranges the user has ever logged.
    pub age_ranges: Vec<String>,
}

impl UserAdProfile {
    pub fn matches(&self, behavior: &str) -> bool {
        match behavior {
            "active_dater_30d" => self.date_count_30d >= 3,
            "high_frequency_30d" => self.date_count_30d >= 5,
            "single_proxy" => !self.has_active_partner,
            _ => false,
        }
    }
}

pub async fn load_profile(
    db: &PgPool,
    redis: &mut redis::aio::ConnectionManager,
    user_id: Uuid,
) -> Result<UserAdProfile, AppError> {
    let key = format!("aduser:{user_id}:profile");

    // Hot path: try cache first.
    if let Ok(Some(cached)) = redis.get::<_, Option<String>>(&key).await {
        if let Ok(p) = serde_json::from_str::<UserAdProfile>(&cached) {
            return Ok(p);
        }
    }

    let date_count_30d: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM dates
        WHERE user_id = $1
          AND deleted_at IS NULL
          AND date_at >= (CURRENT_DATE - INTERVAL '30 days')
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;

    let has_active_partner: bool = sqlx::query_scalar(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM partners
            WHERE user_id = $1 AND relationship_end IS NULL
        )
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;

    let city_ids: Vec<i32> = sqlx::query_scalar(
        r#"
        SELECT DISTINCT city_id FROM dates
        WHERE user_id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;

    let age_ranges: Vec<String> = sqlx::query_scalar(
        r#"
        SELECT DISTINCT age_range FROM dates
        WHERE user_id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;

    let profile = UserAdProfile {
        date_count_30d,
        has_active_partner,
        city_ids,
        age_ranges,
    };

    if let Ok(serialized) = serde_json::to_string(&profile) {
        let _: Result<(), redis::RedisError> =
            redis.set_ex(&key, &serialized, PROFILE_CACHE_TTL_SECS).await;
    }

    Ok(profile)
}

/// Evaluate a target_segment JSON predicate against the user's profile.
/// Empty / null target_segment = match everyone. Each filter field is OR
/// internally and AND across fields.
pub fn matches_segment(profile: &UserAdProfile, segment: Option<&Value>) -> bool {
    let Some(s) = segment else { return true };
    let Some(obj) = s.as_object() else { return true };

    // city_ids: OR. Any of user's cities ∈ targeted set passes.
    if let Some(arr) = obj.get("city_ids").and_then(|v| v.as_array()) {
        if !arr.is_empty() {
            let target: HashSet<i32> =
                arr.iter().filter_map(|v| v.as_i64().map(|n| n as i32)).collect();
            if !profile.city_ids.iter().any(|c| target.contains(c)) {
                return false;
            }
        }
    }

    // age_ranges: OR.
    if let Some(arr) = obj.get("age_ranges").and_then(|v| v.as_array()) {
        if !arr.is_empty() {
            let target: HashSet<&str> = arr.iter().filter_map(|v| v.as_str()).collect();
            if !profile.age_ranges.iter().any(|a| target.contains(a.as_str())) {
                return false;
            }
        }
    }

    // behaviors: AND. All listed behaviors must match — this is how
    // brands narrow down ("active dater AND single").
    if let Some(arr) = obj.get("behaviors").and_then(|v| v.as_array()) {
        for b in arr {
            if let Some(s) = b.as_str() {
                if !profile.matches(s) {
                    return false;
                }
            }
        }
    }

    true
}

/// UTC date'i döner. Sadece `ad_metrics` günlük segmentasyonu için
/// kullanılan day-boundary yardımcısı.
pub fn today() -> chrono::NaiveDate {
    Utc::now().date_naive()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn p() -> UserAdProfile {
        UserAdProfile {
            date_count_30d: 5,
            has_active_partner: false,
            city_ids: vec![1, 5],
            age_ranges: vec!["23-27".into(), "28-32".into()],
        }
    }

    #[test]
    fn empty_segment_matches() {
        assert!(matches_segment(&p(), None));
        assert!(matches_segment(&p(), Some(&json!({}))));
    }

    #[test]
    fn city_filter() {
        assert!(matches_segment(&p(), Some(&json!({"city_ids":[1,99]}))));
        assert!(!matches_segment(&p(), Some(&json!({"city_ids":[99]}))));
    }

    #[test]
    fn age_filter() {
        assert!(matches_segment(&p(), Some(&json!({"age_ranges":["23-27"]}))));
        assert!(!matches_segment(&p(), Some(&json!({"age_ranges":["48+"]}))));
    }

    #[test]
    fn behavior_filter_all_must_match() {
        // Active dater (5>=3 ✓) + single (no partner ✓)
        assert!(matches_segment(
            &p(),
            Some(&json!({"behaviors":["active_dater_30d","single_proxy"]}))
        ));
        // Active dater ✓ + has_active_partner... (single_proxy fails)
        let with_partner = UserAdProfile { has_active_partner: true, ..p() };
        assert!(!matches_segment(
            &with_partner,
            Some(&json!({"behaviors":["active_dater_30d","single_proxy"]}))
        ));
    }

    #[test]
    fn behavior_high_frequency_threshold() {
        let four = UserAdProfile { date_count_30d: 4, ..p() };
        assert!(four.matches("active_dater_30d"));
        assert!(!four.matches("high_frequency_30d"));
    }

    #[test]
    fn intersection_of_filters() {
        // Has city 1 ✓, but no 18-22 → AND fails
        assert!(!matches_segment(
            &p(),
            Some(&json!({"city_ids":[1], "age_ranges":["18-22"]}))
        ));
    }
}
