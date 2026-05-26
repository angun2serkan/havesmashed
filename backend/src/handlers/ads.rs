// User-facing ad serving + click + event tracking.
//
// Anonymity contract:
//   * `ad_metrics` and `ad_placement_metrics` updates here are
//     aggregate-only — never store user_id.
//   * Frequency-cap counters live in Redis under user_id keys with
//     TTL ≤ 24h. They never feed any aggregate analytics or audit
//     log; they exist only to enforce display rules.
//   * Click endpoint returns the brand URL to the frontend; the
//     frontend uses rel="noreferrer" so the brand never sees the
//     havesmashed origin in `Referer`.

use axum::extract::{Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use rand::Rng;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::services::pacing_selector::{self, PacingCandidate};
use crate::services::{ad_targeting, ad_token};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/next", get(next_ad))
        .route("/click", post(click))
        .route("/event", post(event))
        .route("/gate/next", get(gate_next))
        .route("/gate/complete", post(gate_complete))
}

// ════════════════════════════════════════════════════════════════
// GET /api/ads/next?placement=…
// ════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct NextQuery {
    placement: String,
    /// Frontend-generated session UUID for anti-fatigue tracking.
    /// Reset on page reload / app foreground. Only used by feed_native.
    session_id: Option<String>,
}

const FEED_NATIVE_PLACEMENT_KEY: &str = "feed_native";

async fn next_ad(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<NextQuery>,
) -> Result<Json<Value>, AppError> {
    // 1. Placement registry lookup.
    let placement_row: Option<(bool, Value)> = sqlx::query_as(
        "SELECT is_globally_enabled, display_rules FROM ad_placements WHERE key = $1",
    )
    .bind(&q.placement)
    .fetch_optional(&state.db)
    .await?;

    let Some((enabled, rules)) = placement_row else {
        return Err(AppError::NotFound(format!(
            "placement {} not found",
            q.placement
        )));
    };
    if !enabled {
        return Ok(empty_response());
    }

    // 2. Frequency-cap gate (Redis-only — never feeds aggregate logs).
    let mut redis = state.redis.clone();
    if !cap_passes(&mut redis, auth.user_id, &q.placement, &rules).await? {
        return Ok(empty_response());
    }

    // 3. Feed Native: pacing-aware selection with anti-fatigue.
    //    Other placements still use legacy weighted random for now.
    if q.placement == FEED_NATIVE_PLACEMENT_KEY {
        return next_ad_feed_native(state, auth, q, rules, redis).await;
    }

    // 3. Eligible candidates for this placement.
    let candidates: Vec<CandidateRow> = sqlx::query_as(
        r#"
        SELECT
            c.id, c.creative, c.click_url, c.target_segment, c.weight
        FROM ad_campaigns c
        WHERE c.placement_key = $1
          AND c.status = 'active'
          AND c.deleted_at IS NULL
          AND c.is_dry_run = FALSE
          AND NOW() BETWEEN c.starts_at AND c.ends_at
        "#,
    )
    .bind(&q.placement)
    .fetch_all(&state.db)
    .await?;

    if candidates.is_empty() {
        return Ok(empty_response());
    }

    // 4. Targeting filter.
    let profile = ad_targeting::load_profile(&state.db, &mut redis, auth.user_id).await?;
    let eligible: Vec<CandidateRow> = candidates
        .into_iter()
        .filter(|c| ad_targeting::matches_segment(&profile, c.target_segment.as_ref()))
        .collect();

    if eligible.is_empty() {
        return Ok(empty_response());
    }

    // 5. Weighted random rotation.
    let chosen = pick_weighted(&eligible);
    let campaign_id = chosen.id;

    // 6. Increment aggregate counters (no user_id, no per-impression row).
    record_impression(&state.db, campaign_id, &q.placement).await?;

    // 7. Update frequency-cap state.
    cap_record_impression(&mut redis, auth.user_id, &q.placement).await;

    // 8. Mint impression token (HMAC-signed JWT, 1h TTL).
    let token = ad_token::issue(campaign_id, &q.placement, &state.config.jwt_secret)?;

    let dwell_ms_for_impression = rules
        .get("dwell_ms_for_impression")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    Ok(Json(json!({
        "success": true,
        "data": {
            "campaign_id": campaign_id,
            "placement_key": q.placement,
            "creative": chosen.creative.clone(),
            "click_url": chosen.click_url.clone(),
            "impression_token": token,
            "dwell_ms_for_impression": dwell_ms_for_impression,
        },
        "error": null
    })))
}

// ════════════════════════════════════════════════════════════════
// Feed Native — pacing-aware selection
// ════════════════════════════════════════════════════════════════
//
// Score formula:
//   score = (target_impressions - current_impressions)
//           × urgency_multiplier
//           × internal_share
// where
//   urgency_multiplier = min(total_duration / remaining_duration, 5.0)
//   internal_share     = weight / Σ(weight of same brand's active campaigns)
//
// Pipeline:
//   1. Load eligible pool (Redis cache, 1h TTL) — fresh sweep includes
//      over-delivered exclusion via SQL filter.
//   2. Apply user targeting.
//   3. Apply anti-fatigue: filter out campaigns this user has already
//      seen in the current session; reset the seen set if all eligible
//      were already shown.
//   4. Compute scores, linear-normalize to probabilities with 1% floor.
//   5. Weighted random pick.
//   6. Record impression + add to seen set.

const PLACEMENT_POOL_TTL_SECS: i64 = 3600;
const PLACEMENT_SEEN_TTL_SECS: i64 = 86_400;

#[derive(Clone, Serialize, Deserialize, sqlx::FromRow)]
struct PlacementCandidate {
    id: Uuid,
    creative: Value,
    click_url: String,
    target_segment: Option<Value>,
    weight: i32,
    brand_id: Uuid,
    target_impressions: i32,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
    current_impressions: i64,
}

impl PlacementCandidate {
    fn to_pacing(&self) -> PacingCandidate {
        PacingCandidate {
            id: self.id,
            brand_id: self.brand_id,
            weight: self.weight,
            target_impressions: self.target_impressions,
            starts_at: self.starts_at,
            ends_at: self.ends_at,
            current_impressions: self.current_impressions,
        }
    }
}

fn placement_pool_cache_key(placement: &str) -> String {
    format!("placement_pool:{}", placement)
}

async fn next_ad_feed_native(
    state: AppState,
    auth: AuthUser,
    q: NextQuery,
    rules: Value,
    mut redis: redis::aio::ConnectionManager,
) -> Result<Json<Value>, AppError> {
    let pool = load_placement_pool(&state.db, &mut redis, FEED_NATIVE_PLACEMENT_KEY).await?;
    if pool.is_empty() {
        return Ok(empty_response());
    }

    let profile = ad_targeting::load_profile(&state.db, &mut redis, auth.user_id).await?;
    let targeted: Vec<PlacementCandidate> = pool
        .into_iter()
        .filter(|c| ad_targeting::matches_segment(&profile, c.target_segment.as_ref()))
        .collect();
    if targeted.is_empty() {
        return Ok(empty_response());
    }

    // Anti-fatigue: filter campaigns already seen in this session.
    // If session_id missing, skip anti-fatigue (legacy clients).
    let (eligible, seen_key) = if let Some(sid) = q.session_id.as_deref() {
        let key = format!("feed_seen:{}:{}", auth.user_id, sid);
        let seen: Vec<String> = redis.smembers(&key).await.unwrap_or_default();
        let seen_ids: std::collections::HashSet<Uuid> =
            seen.iter().filter_map(|s| Uuid::parse_str(s).ok()).collect();
        let filtered: Vec<PlacementCandidate> = targeted
            .iter()
            .filter(|c| !seen_ids.contains(&c.id))
            .cloned()
            .collect();
        if filtered.is_empty() {
            // Reset: kullanıcı tüm reklamları gördü, devre başa.
            let _: Result<i64, _> = redis.del(&key).await;
            (targeted, Some(key))
        } else {
            (filtered, Some(key))
        }
    } else {
        (targeted, None)
    };

    let pacing_pool: Vec<PacingCandidate> = eligible.iter().map(|c| c.to_pacing()).collect();
    let Some(campaign_id) = pacing_selector::pick_one(
        &pacing_pool,
        Utc::now(),
        pacing_selector::URGENCY_CAP_DEFAULT,
    ) else {
        return Ok(empty_response());
    };
    let chosen = eligible
        .iter()
        .find(|c| c.id == campaign_id)
        .ok_or_else(|| AppError::Internal("picked campaign missing from pool".to_string()))?;

    record_impression(&state.db, campaign_id, &q.placement).await?;
    cap_record_impression(&mut redis, auth.user_id, &q.placement).await;

    // Add to seen set with rolling TTL.
    if let Some(key) = seen_key {
        let _: Result<i64, _> = redis.sadd(&key, campaign_id.to_string()).await;
        let _: Result<bool, _> = redis.expire(&key, PLACEMENT_SEEN_TTL_SECS).await;
    }

    let token = ad_token::issue(campaign_id, &q.placement, &state.config.jwt_secret)?;
    let dwell_ms_for_impression = rules
        .get("dwell_ms_for_impression")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    Ok(Json(json!({
        "success": true,
        "data": {
            "campaign_id": campaign_id,
            "placement_key": q.placement,
            "creative": chosen.creative.clone(),
            "click_url": chosen.click_url.clone(),
            "impression_token": token,
            "dwell_ms_for_impression": dwell_ms_for_impression,
        },
        "error": null
    })))
}

/// Saat başı cache'lenen eligible kampanya havuzunu döndürür.
/// `feed_native` ve `gated_interstitial` aynı imza paylaşır — placement_key
/// SQL WHERE filtresine girer ve cache key'e gömülür.
async fn load_placement_pool(
    db: &PgPool,
    redis: &mut redis::aio::ConnectionManager,
    placement_key: &str,
) -> Result<Vec<PlacementCandidate>, AppError> {
    let cache_key = placement_pool_cache_key(placement_key);

    if let Ok(raw) = redis.get::<_, String>(&cache_key).await {
        if let Ok(pool) = serde_json::from_str::<Vec<PlacementCandidate>>(&raw) {
            return Ok(pool);
        }
    }

    // Cache miss — query DB. Over-delivered exclusion happens in SQL so
    // a campaign that hit target between cache refreshes still serves
    // up to ~59min extra (intra-cache snapshot is stale by design).
    let pool: Vec<PlacementCandidate> = sqlx::query_as(
        r#"
        SELECT
            c.id,
            c.creative,
            c.click_url,
            c.target_segment,
            c.weight,
            c.brand_id,
            c.target_impressions,
            c.starts_at,
            c.ends_at,
            COALESCE(m.impressions_total, 0)::bigint AS current_impressions
        FROM ad_campaigns c
        LEFT JOIN (
            SELECT campaign_id, SUM(impressions) AS impressions_total
            FROM ad_metrics
            GROUP BY campaign_id
        ) m ON m.campaign_id = c.id
        WHERE c.placement_key = $1
          AND c.status = 'active'
          AND c.deleted_at IS NULL
          AND c.is_dry_run = FALSE
          AND NOW() BETWEEN c.starts_at AND c.ends_at
          AND c.target_impressions IS NOT NULL
          AND COALESCE(m.impressions_total, 0) < c.target_impressions
        "#,
    )
    .bind(placement_key)
    .fetch_all(db)
    .await?;

    if let Ok(serialized) = serde_json::to_string(&pool) {
        let _: Result<(), _> = redis
            .set_ex(&cache_key, serialized, PLACEMENT_POOL_TTL_SECS as u64)
            .await;
    }

    Ok(pool)
}

// ── Helpers ───────────────────────────────────────────────────

#[derive(sqlx::FromRow, Clone)]
struct CandidateRow {
    id: Uuid,
    creative: Value,
    click_url: String,
    target_segment: Option<Value>,
    weight: i32,
}

fn empty_response() -> Json<Value> {
    Json(json!({ "success": true, "data": null, "error": null }))
}

fn pick_weighted(candidates: &[CandidateRow]) -> &CandidateRow {
    let total: i32 = candidates.iter().map(|c| c.weight).sum();
    if total <= 0 {
        return &candidates[0];
    }
    let mut roll = rand::thread_rng().gen_range(0..total);
    for c in candidates {
        if roll < c.weight {
            return c;
        }
        roll -= c.weight;
    }
    &candidates[candidates.len() - 1]
}

async fn cap_passes(
    redis: &mut redis::aio::ConnectionManager,
    user_id: Uuid,
    placement: &str,
    rules: &Value,
) -> Result<bool, AppError> {
    let day = ad_targeting::today();
    let day_key = format!("adcap:{user_id}:{placement}:day:{day}");
    let lastseen_key = format!("adcap:{user_id}:{placement}:lastseen");

    if let Some(cap) = rules
        .get("frequency_cap_per_session")
        .and_then(|v| v.as_u64())
    {
        let count: i64 = redis.get(&day_key).await.unwrap_or(0);
        if (count as u64) >= cap {
            return Ok(false);
        }
    }

    if let Some(min_gap) = rules.get("min_gap_minutes").and_then(|v| v.as_u64()) {
        let last: Option<i64> = redis.get(&lastseen_key).await.unwrap_or(None);
        if let Some(ts) = last {
            let now = Utc::now().timestamp();
            if now - ts < (min_gap * 60) as i64 {
                return Ok(false);
            }
        }
    }

    Ok(true)
}

async fn cap_record_impression(
    redis: &mut redis::aio::ConnectionManager,
    user_id: Uuid,
    placement: &str,
) {
    let day = ad_targeting::today();
    let day_key = format!("adcap:{user_id}:{placement}:day:{day}");
    let lastseen_key = format!("adcap:{user_id}:{placement}:lastseen");
    let now = Utc::now().timestamp();

    let _: Result<i64, _> = redis.incr(&day_key, 1).await;
    let _: Result<i64, _> = redis.expire(&day_key, 86_400).await;
    let _: Result<(), _> = redis.set_ex(&lastseen_key, now, 86_400).await;
}

async fn record_impression(
    db: &PgPool,
    campaign_id: Uuid,
    placement_key: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO ad_metrics (campaign_id, date, impressions, clicks, extra)
        VALUES ($1, CURRENT_DATE, 1, 0, '{}'::jsonb)
        ON CONFLICT (campaign_id, date) DO UPDATE
            SET impressions = ad_metrics.impressions + 1
        "#,
    )
    .bind(campaign_id)
    .execute(db)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO ad_placement_metrics (placement_key, date, impressions, clicks, extra)
        VALUES ($1, CURRENT_DATE, 1, 0, '{}'::jsonb)
        ON CONFLICT (placement_key, date) DO UPDATE
            SET impressions = ad_placement_metrics.impressions + 1
        "#,
    )
    .bind(placement_key)
    .execute(db)
    .await?;

    Ok(())
}

// ════════════════════════════════════════════════════════════════
// POST /api/ads/click
// ════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct ClickBody {
    impression_token: String,
}

async fn click(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<ClickBody>,
) -> Result<Json<Value>, AppError> {
    let claims = ad_token::verify(&body.impression_token, &state.config.jwt_secret)?;

    // Single-use enforcement: SETNX with token's own TTL on the jti.
    // Subsequent click attempts on the same token are silently
    // accepted but don't bump the counter — gives the user the
    // expected redirect without inflating brand-visible click count.
    let mut redis = state.redis.clone();
    let used_key = format!("adclick:{}", claims.jti);
    let first_use: bool = redis
        .set_nx::<_, _, bool>(&used_key, "1")
        .await
        .map_err(AppError::Redis)?;
    if first_use {
        let ttl = (claims.exp - Utc::now().timestamp()).max(60);
        let _: Result<bool, _> = redis.expire(&used_key, ttl).await;
    }

    // Look up the campaign to get its click_url. Token guarantees
    // campaign_id is real (HMAC binding), but the campaign may have
    // been deleted/paused in the meantime — handle gracefully.
    let row: Option<(String, String, bool, Option<chrono::DateTime<Utc>>)> = sqlx::query_as(
        "SELECT click_url, status, is_dry_run, deleted_at FROM ad_campaigns WHERE id = $1",
    )
    .bind(claims.campaign_id)
    .fetch_optional(&state.db)
    .await?;

    let Some((click_url, status, is_dry_run, deleted_at)) = row else {
        return Err(AppError::NotFound("campaign no longer exists".to_string()));
    };

    // T3.2 — only 'active' campaigns count clicks. Status flipped by
    // approval flow or budget aggregator auto-pause: counters skip.
    let is_serving = status == "active" && deleted_at.is_none() && !is_dry_run;
    if !is_serving {
        // Don't dead-end the user — give them the URL but skip counter.
        return Ok(Json(json!({
            "success": true,
            "data": { "redirect_url": click_url, "tracked": false },
            "error": null
        })));
    }

    if first_use {
        sqlx::query(
            r#"
            INSERT INTO ad_metrics (campaign_id, date, impressions, clicks, extra)
            VALUES ($1, CURRENT_DATE, 0, 1, '{}'::jsonb)
            ON CONFLICT (campaign_id, date) DO UPDATE
                SET clicks = ad_metrics.clicks + 1
            "#,
        )
        .bind(claims.campaign_id)
        .execute(&state.db)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO ad_placement_metrics (placement_key, date, impressions, clicks, extra)
            VALUES ($1, CURRENT_DATE, 0, 1, '{}'::jsonb)
            ON CONFLICT (placement_key, date) DO UPDATE
                SET clicks = ad_placement_metrics.clicks + 1
            "#,
        )
        .bind(&claims.placement_key)
        .execute(&state.db)
        .await?;
    }

    // auth is unused here but the click endpoint is auth-required so
    // anonymous click farms can't inflate counters via stolen tokens.
    let _ = auth;

    Ok(Json(json!({
        "success": true,
        "data": { "redirect_url": click_url, "tracked": first_use },
        "error": null
    })))
}

// ════════════════════════════════════════════════════════════════
// POST /api/ads/event
// ════════════════════════════════════════════════════════════════
//
// Placement-specific signals (dwell_ms, scroll_past, badge_claim,
// view_complete, skip). Numeric `value` is summed; presence-only
// events bump a `_count` field. All accumulated into ad_metrics.extra
// JSONB so per-campaign breakdowns stay aggregate.

const ALLOWED_EVENT_TYPES: &[&str] = &[
    "dwell_ms",
    "scroll_past",
    "badge_claim",
    "view_complete",
    "skip",
    "comment",
    "open",
    "delivered",
];

#[derive(Deserialize)]
struct EventBody {
    impression_token: String,
    event_type: String,
    /// Optional numeric payload (e.g. dwell milliseconds). Bumps a `_sum`
    /// alongside the `_count`.
    value: Option<i64>,
}

async fn event(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<EventBody>,
) -> Result<Json<Value>, AppError> {
    if !ALLOWED_EVENT_TYPES.contains(&body.event_type.as_str()) {
        return Err(AppError::BadRequest(format!(
            "unsupported event_type: {}",
            body.event_type
        )));
    }

    let claims = ad_token::verify(&body.impression_token, &state.config.jwt_secret)?;
    let _ = auth;

    accumulate_event(
        &state.db,
        claims.campaign_id,
        &claims.placement_key,
        &body.event_type,
        body.value,
    )
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": { "recorded": body.event_type },
        "error": null
    })))
}

async fn accumulate_event(
    db: &PgPool,
    campaign_id: Uuid,
    placement_key: &str,
    event_type: &str,
    value: Option<i64>,
) -> Result<(), AppError> {
    // Read-modify-write of the JSONB extra blob. Throughput is low
    // (one write per event) and brand-visible counters are eventual,
    // so the read-modify-write race is acceptable here.
    for table in ["ad_metrics", "ad_placement_metrics"] {
        let extra: Option<Value> = if table == "ad_metrics" {
            sqlx::query_scalar(
                "SELECT extra FROM ad_metrics WHERE campaign_id = $1 AND date = CURRENT_DATE",
            )
            .bind(campaign_id)
            .fetch_optional(db)
            .await?
        } else {
            sqlx::query_scalar(
                "SELECT extra FROM ad_placement_metrics WHERE placement_key = $1 AND date = CURRENT_DATE",
            )
            .bind(placement_key)
            .fetch_optional(db)
            .await?
        };

        let mut next = extra.unwrap_or_else(|| json!({}));
        let count_key = format!("{event_type}_count");
        let cur_count = next
            .get(&count_key)
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        next[&count_key] = json!(cur_count + 1);
        if let Some(v) = value {
            let sum_key = format!("{event_type}_sum");
            let cur_sum = next
                .get(&sum_key)
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            next[&sum_key] = json!(cur_sum + v);
        }

        if table == "ad_metrics" {
            sqlx::query(
                r#"
                INSERT INTO ad_metrics (campaign_id, date, impressions, clicks, extra)
                VALUES ($1, CURRENT_DATE, 0, 0, $2)
                ON CONFLICT (campaign_id, date) DO UPDATE SET extra = $2
                "#,
            )
            .bind(campaign_id)
            .bind(&next)
            .execute(db)
            .await?;
        } else {
            sqlx::query(
                r#"
                INSERT INTO ad_placement_metrics (placement_key, date, impressions, clicks, extra)
                VALUES ($1, CURRENT_DATE, 0, 0, $2)
                ON CONFLICT (placement_key, date) DO UPDATE SET extra = $2
                "#,
            )
            .bind(placement_key)
            .bind(&next)
            .execute(db)
            .await?;
        }
    }
    Ok(())
}

// ════════════════════════════════════════════════════════════════
// GET /api/ads/gate/next?context=date_create
// ════════════════════════════════════════════════════════════════
//
// Date-submit gate ad serving. Distinct from /api/ads/next in two
// ways:
//   1. Returns `{ gate_required: false }` when the gate should be
//      skipped — placement globally off, user opted out, in
//      new-user grace, or no eligible campaign.
//   2. The token it mints (`gate_token`) is single-use AND short
//      enough that gate_complete must follow within 10min. The
//      regular impression token isn't reused so that a stolen
//      impression token can't bypass the gate.

const GATE_PLACEMENT_KEY: &str = "gated_interstitial";

/// Kullanıcının günde toplam kaç gate görebileceği. 8 → aşırı dating
/// yapan kullanıcıyı bombalamamak için üst sınır. Aşıldığında gate
/// `skipped("daily_cap")` döner, kullanıcı tarihi kaydedebilir.
const GATE_PER_USER_PER_DAY: i64 = 8;

/// Aynı kullanıcının aynı kampanyayı günde kaç kez görebileceği.
/// 2 → diversity garantisi: tek brand kullanıcının günlük tüm gate'lerini
/// dolduramaz.
const GATE_PER_CAMPAIGN_PER_DAY: i64 = 2;

#[derive(Deserialize)]
struct GateNextQuery {
    /// Free-form context tag; only "date_create" is wired today. Bound
    /// into the issued gate_token so a token for one context can't be
    /// replayed against another.
    context: Option<String>,
    /// Frontend-generated per-foreground session UUID for anti-fatigue.
    /// Aynı session içinde aynı kampanyayı tekrar göstermemek için.
    session_id: Option<String>,
}

async fn gate_next(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<GateNextQuery>,
) -> Result<Json<Value>, AppError> {
    let context = q.context.unwrap_or_else(|| "date_create".to_string());

    // 1. Placement registry.
    let placement_row: Option<(bool, Value)> = sqlx::query_as(
        "SELECT is_globally_enabled, display_rules FROM ad_placements WHERE key = $1",
    )
    .bind(GATE_PLACEMENT_KEY)
    .fetch_optional(&state.db)
    .await?;

    let Some((enabled, rules)) = placement_row else {
        // Placement row missing means migration didn't run — treat as off.
        return Ok(skipped("placement_missing"));
    };
    if !enabled {
        return Ok(skipped("placement_disabled"));
    }

    let min_view_seconds = rules
        .get("min_view_seconds")
        .and_then(|v| v.as_u64())
        .unwrap_or(5);

    // 2. New-user grace: skip the gate for the user's first N dates so
    //    onboarding friction stays low.
    let grace_count = rules
        .get("new_user_grace_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if grace_count > 0 {
        let date_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM dates WHERE user_id = $1 AND deleted_at IS NULL",
        )
        .bind(auth.user_id)
        .fetch_one(&state.db)
        .await?;
        if (date_count as u64) < grace_count {
            return Ok(skipped("new_user_grace"));
        }
    }

    // 3. Per-user-per-day global cap.
    let mut redis = state.redis.clone();
    let day = ad_targeting::today();
    let day_key = format!("gate_day:{}:{}", auth.user_id, day);
    let day_count: i64 = redis.get(&day_key).await.unwrap_or(0);
    if day_count >= GATE_PER_USER_PER_DAY {
        return Ok(skipped("daily_cap"));
    }

    // 4. Eligible pool (saat başı cache, paylaşılan loader).
    let pool = load_placement_pool(&state.db, &mut redis, GATE_PLACEMENT_KEY).await?;
    if pool.is_empty() {
        return Ok(skipped("no_campaign"));
    }

    // 5. Targeting filter.
    let profile = ad_targeting::load_profile(&state.db, &mut redis, auth.user_id).await?;
    let targeted: Vec<PlacementCandidate> = pool
        .into_iter()
        .filter(|c| ad_targeting::matches_segment(&profile, c.target_segment.as_ref()))
        .collect();
    if targeted.is_empty() {
        return Ok(skipped("no_eligible"));
    }

    // 6. Per-user-per-campaign-per-day cap filter — bugün M kez görülen
    //    kampanyaları havuzdan çıkar.
    let mut campaign_day_filtered: Vec<PlacementCandidate> = Vec::with_capacity(targeted.len());
    for c in targeted.iter() {
        let camp_key = format!("gate_camp_day:{}:{}:{}", auth.user_id, c.id, day);
        let camp_count: i64 = redis.get(&camp_key).await.unwrap_or(0);
        if camp_count < GATE_PER_CAMPAIGN_PER_DAY {
            campaign_day_filtered.push(c.clone());
        }
    }
    if campaign_day_filtered.is_empty() {
        return Ok(skipped("campaign_caps_exhausted"));
    }

    // 7. Session anti-fatigue: filter campaigns seen this foreground session.
    //    Boşalırsa seen-set'i sıfırla (devre başa).
    let (eligible, seen_key) = if let Some(sid) = q.session_id.as_deref() {
        let key = format!("gate_seen:{}:{}", auth.user_id, sid);
        let seen: Vec<String> = redis.smembers(&key).await.unwrap_or_default();
        let seen_ids: std::collections::HashSet<Uuid> =
            seen.iter().filter_map(|s| Uuid::parse_str(s).ok()).collect();
        let unseen: Vec<PlacementCandidate> = campaign_day_filtered
            .iter()
            .filter(|c| !seen_ids.contains(&c.id))
            .cloned()
            .collect();
        if unseen.is_empty() {
            let _: Result<i64, _> = redis.del(&key).await;
            (campaign_day_filtered, Some(key))
        } else {
            (unseen, Some(key))
        }
    } else {
        (campaign_day_filtered, None)
    };

    // 8. Pacing-aware pick — gate için yüksek urgency cap (10x) son hafta
    //    under-delivered kampanyaya agresif boost.
    let pacing_pool: Vec<PacingCandidate> = eligible.iter().map(|c| c.to_pacing()).collect();
    let Some(campaign_id) = pacing_selector::pick_one(
        &pacing_pool,
        Utc::now(),
        pacing_selector::URGENCY_CAP_GATE,
    ) else {
        return Ok(skipped("pacing_empty"));
    };
    let chosen = eligible
        .iter()
        .find(|c| c.id == campaign_id)
        .ok_or_else(|| AppError::Internal("picked campaign missing from pool".to_string()))?;

    // 9. Counters: impression sayma + tüm cap'leri bump et. Gate'i kullanıcı
    //    görmeyi kabul etmiş sayılır — impression burada işlenir, brand
    //    counter accuracy gate_complete'in beklemesinden önemli.
    record_impression(&state.db, campaign_id, GATE_PLACEMENT_KEY).await?;
    let _: Result<i64, _> = redis.incr(&day_key, 1).await;
    let _: Result<i64, _> = redis.expire(&day_key, 86_400).await;
    let camp_key = format!("gate_camp_day:{}:{}:{}", auth.user_id, campaign_id, day);
    let _: Result<i64, _> = redis.incr(&camp_key, 1).await;
    let _: Result<i64, _> = redis.expire(&camp_key, 86_400).await;
    if let Some(key) = seen_key {
        let _: Result<i64, _> = redis.sadd(&key, campaign_id.to_string()).await;
        let _: Result<bool, _> = redis.expire(&key, PLACEMENT_SEEN_TTL_SECS).await;
    }

    let (gate_token, _jti) = ad_token::issue_gate(
        campaign_id,
        GATE_PLACEMENT_KEY,
        auth.user_id,
        &context,
        &state.config.jwt_secret,
    )?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "gate_required": true,
            "context": context,
            "campaign_id": campaign_id,
            "placement_key": GATE_PLACEMENT_KEY,
            "creative": chosen.creative.clone(),
            "click_url": chosen.click_url.clone(),
            "min_view_seconds": min_view_seconds,
            "gate_token": gate_token,
        },
        "error": null
    })))
}

fn skipped(reason: &str) -> Json<Value> {
    Json(json!({
        "success": true,
        "data": { "gate_required": false, "reason": reason },
        "error": null
    }))
}

// ════════════════════════════════════════════════════════════════
// POST /api/ads/gate/complete
// ════════════════════════════════════════════════════════════════
//
// Closes out the gate impression with the outcome (view_complete or
// skip) and mints the short-lived save_token that POST /api/dates
// will accept. Single-use enforcement via Redis SETNX on the
// gate_token's jti — replaying the same token (e.g. an attacker who
// snooped one) cannot mint a second save_token.

#[derive(Deserialize)]
struct GateCompleteBody {
    gate_token: String,
    /// "completed" or "skipped"; anything else is rejected.
    outcome: String,
    /// Optional elapsed-watch milliseconds for the dwell aggregate.
    completion_ms: Option<i64>,
}

async fn gate_complete(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<GateCompleteBody>,
) -> Result<Json<Value>, AppError> {
    // Skip kaldırıldı — yalnızca completed kabul ediliyor.
    let outcome = match body.outcome.as_str() {
        "completed" => "view_complete",
        other => {
            return Err(AppError::BadRequest(format!(
                "outcome must be 'completed' (got '{other}')"
            )))
        }
    };

    let claims = ad_token::verify_gate(&body.gate_token, &state.config.jwt_secret)?;

    // Bind the caller — only the user who originally requested the
    // gate can complete it. user_hash is derived from user_id+jti so
    // this also defends against the (unlikely) case where the token
    // leaks: an attacker can't redeem it as themselves.
    let expected_hash = ad_token::user_hash(auth.user_id, claims.jti);
    if expected_hash != claims.user_hash {
        return Err(AppError::Forbidden("gate token user mismatch".to_string()));
    }

    // Single-use: SETNX on jti for the gate_token's remaining TTL.
    let mut redis = state.redis.clone();
    let used_key = format!("adgate:{}", claims.jti);
    let first_use: bool = redis
        .set_nx::<_, _, bool>(&used_key, "1")
        .await
        .map_err(AppError::Redis)?;
    if !first_use {
        return Err(AppError::Conflict("gate token already used".to_string()));
    }
    let ttl = (claims.exp - Utc::now().timestamp()).max(60);
    let _: Result<bool, _> = redis.expire(&used_key, ttl).await;

    // Record the outcome event (view_complete or skip) on the placement
    // + campaign aggregates. completion_ms (if provided) becomes dwell.
    accumulate_event(
        &state.db,
        claims.campaign_id,
        &claims.placement_key,
        outcome,
        None,
    )
    .await?;
    if let Some(ms) = body.completion_ms {
        if ms > 0 {
            accumulate_event(
                &state.db,
                claims.campaign_id,
                &claims.placement_key,
                "completion_seconds",
                Some(ms),
            )
            .await?;
        }
    }

    let (save_token, _save_jti, ttl_secs) =
        ad_token::issue_save(auth.user_id, &claims.context, &state.config.jwt_secret)?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "save_token": save_token,
            "expires_in": ttl_secs,
            "context": claims.context,
            "outcome": body.outcome,
        },
        "error": null
    })))
}
