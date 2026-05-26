//! Pacing-aware ad campaign selector.
//!
//! Tek source of truth: hem feed_native (tek seçim) hem forum_thread
//! (top-N seçim) bu modülü kullanır. Skor formülü:
//!
//!   score = (target_impressions - current_impressions)
//!           × urgency_multiplier
//!           × internal_share
//!
//!   urgency_multiplier = min(total_duration / remaining_duration, 5.0)
//!   internal_share     = weight / Σ(weight of same brand's active campaigns)
//!
//! Brand-içi normalize sayesinde weight'in mutlak değeri brand-arası
//! rekabette etkisiz; weight sadece brand'in kendi kampanyaları arasında
//! pay belirler.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Default urgency multiplier cap — feed_native ve forum_thread bunu kullanır.
pub const URGENCY_CAP_DEFAULT: f64 = 5.0;
/// Gated interstitial premium envanter olduğu için daha agresif urgency
/// → son hafta under-delivered kampanyaya öncelik artar.
pub const URGENCY_CAP_GATE: f64 = 10.0;

pub const PROB_FLOOR: f64 = 0.01;

/// Pacing skoru hesaplamak için gereken minimum kampanya alanları.
/// Caller'lar bu yapıyı kendi zengin satırlarından map ederek üretir;
/// servis sadece bu alanlara bakar, sonuç olarak `Uuid` döndürür.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PacingCandidate {
    pub id: Uuid,
    pub brand_id: Uuid,
    pub weight: i32,
    pub target_impressions: i32,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub current_impressions: i64,
}

/// Ham skorları hesaplar (normalize edilmemiş).
/// `urgency_cap` placement'a göre değişir (örn. gate için 10.0, feed için 5.0).
fn compute_scores(candidates: &[PacingCandidate], now: DateTime<Utc>, urgency_cap: f64) -> Vec<f64> {
    let mut brand_weight_sum: HashMap<Uuid, i64> = HashMap::new();
    let mut brand_count: HashMap<Uuid, i64> = HashMap::new();
    for c in candidates {
        *brand_weight_sum.entry(c.brand_id).or_insert(0) += c.weight.max(0) as i64;
        *brand_count.entry(c.brand_id).or_insert(0) += 1;
    }

    let mut scores = Vec::with_capacity(candidates.len());
    for c in candidates {
        let remaining_impr = ((c.target_impressions as i64) - c.current_impressions).max(0) as f64;
        if remaining_impr <= 0.0 {
            scores.push(0.0);
            continue;
        }

        let total_secs = (c.ends_at - c.starts_at).num_seconds().max(1) as f64;
        let remaining_secs = (c.ends_at - now).num_seconds().max(1) as f64;
        let urgency = (total_secs / remaining_secs).min(urgency_cap);

        let brand_total = brand_weight_sum.get(&c.brand_id).copied().unwrap_or(0);
        let internal_share = if brand_total > 0 {
            (c.weight.max(0) as f64) / (brand_total as f64)
        } else {
            let n = brand_count.get(&c.brand_id).copied().unwrap_or(1) as f64;
            1.0 / n
        };

        scores.push(remaining_impr * urgency * internal_share);
    }
    scores
}

/// Ham skorları olasılığa çevirir: linear normalize + min %1 floor (N<100).
fn normalize_with_floor(scores: &[f64]) -> Vec<f64> {
    if scores.is_empty() {
        return Vec::new();
    }
    let total: f64 = scores.iter().sum();
    if total <= 0.0 {
        // Tümü 0 — eşit dağıtım.
        let n = scores.len() as f64;
        return vec![1.0 / n; scores.len()];
    }
    let mut probs: Vec<f64> = scores.iter().map(|s| s / total).collect();
    if probs.len() < 100 {
        for p in probs.iter_mut() {
            if *p < PROB_FLOOR {
                *p = PROB_FLOOR;
            }
        }
        let renorm: f64 = probs.iter().sum();
        if renorm > 0.0 {
            for p in probs.iter_mut() {
                *p /= renorm;
            }
        }
    }
    probs
}

fn weighted_pick_index(probs: &[f64]) -> Option<usize> {
    if probs.is_empty() {
        return None;
    }
    let total: f64 = probs.iter().sum();
    if total <= 0.0 {
        return Some(rand::thread_rng().gen_range(0..probs.len()));
    }
    let mut roll: f64 = rand::thread_rng().gen::<f64>() * total;
    for (i, p) in probs.iter().enumerate() {
        if roll < *p {
            return Some(i);
        }
        roll -= *p;
    }
    Some(probs.len() - 1)
}

/// Tek kampanya seçer (feed_native / gated_interstitial gibi tek-slot
/// envanter için). Skorları hesaplar, normalize eder, weighted random
/// pick yapar. `urgency_cap` placement-spesifik (örn. gate=10, feed=5).
pub fn pick_one(
    candidates: &[PacingCandidate],
    now: DateTime<Utc>,
    urgency_cap: f64,
) -> Option<Uuid> {
    if candidates.is_empty() {
        return None;
    }
    let scores = compute_scores(candidates, now, urgency_cap);
    let probs = normalize_with_floor(&scores);
    weighted_pick_index(&probs).map(|i| candidates[i].id)
}

/// En fazla `n` kampanya seçer — weighted sampling without replacement.
/// Her iterasyonda kalan adayların olasılıkları yeniden normalize edilir;
/// böylece düşük skorlu kampanyalar da slot bulabilir (deterministik
/// "top N" yerine olasılıksal seçim → diversity).
pub fn pick_top_n(
    candidates: &[PacingCandidate],
    now: DateTime<Utc>,
    n: usize,
    urgency_cap: f64,
) -> Vec<Uuid> {
    if candidates.is_empty() || n == 0 {
        return Vec::new();
    }
    let scores = compute_scores(candidates, now, urgency_cap);
    let probs = normalize_with_floor(&scores);
    if probs.is_empty() {
        return Vec::new();
    }

    let target = n.min(candidates.len());
    let mut remaining: Vec<(usize, f64)> = probs.into_iter().enumerate().collect();
    let mut picked: Vec<Uuid> = Vec::with_capacity(target);

    while picked.len() < target && !remaining.is_empty() {
        let total: f64 = remaining.iter().map(|(_, p)| *p).sum();
        let chosen_remaining_idx = if total <= 0.0 {
            rand::thread_rng().gen_range(0..remaining.len())
        } else {
            let mut roll: f64 = rand::thread_rng().gen::<f64>() * total;
            let mut idx = remaining.len() - 1;
            for (i, (_, p)) in remaining.iter().enumerate() {
                if roll < *p {
                    idx = i;
                    break;
                }
                roll -= *p;
            }
            idx
        };
        let (orig_idx, _) = remaining.swap_remove(chosen_remaining_idx);
        picked.push(candidates[orig_idx].id);
    }

    picked
}
