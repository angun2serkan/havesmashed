// K-anonymity guard.
//
// Every aggregate report that is exposed to humans (admin dashboard,
// public stats, advertiser pitch) MUST run candidate counts through
// `safe_count` before display. Counts below the threshold are masked
// to prevent re-identification of small cohorts.
//
// Threshold rationale: 1000 users is a comfortable lower bound where
// individual identification via overlapping segments becomes
// statistically infeasible for the demographic dimensions we expose.
// Documented in PRIVACY_POLICY_INTERNAL.md.
//
// This is the ONLY supported way to publish a count derived from
// user-tied tables. Bypassing it is a privacy contract violation.

pub const K_THRESHOLD: i64 = 1000;

/// Returns the count if it meets the k-anonymity threshold, otherwise None.
/// Callers should treat `None` as "below threshold — do not publish".
pub fn safe_count(actual: i64) -> Option<i64> {
    if actual >= K_THRESHOLD {
        Some(actual)
    } else {
        None
    }
}

/// Convenience wrapper for nullable inputs (e.g. SQL `COUNT(*)` results
/// that are typed as `Option<i64>` by sqlx in some contexts).
#[allow(dead_code)]
pub fn safe_count_opt(actual: Option<i64>) -> Option<i64> {
    actual.and_then(safe_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_at_threshold() {
        assert_eq!(safe_count(1000), Some(1000));
    }

    #[test]
    fn allows_above_threshold() {
        assert_eq!(safe_count(14_300), Some(14_300));
    }

    #[test]
    fn blocks_below_threshold() {
        assert_eq!(safe_count(999), None);
        assert_eq!(safe_count(0), None);
        assert_eq!(safe_count(47), None);
    }

    #[test]
    fn opt_wrapper_passes_through() {
        assert_eq!(safe_count_opt(Some(2000)), Some(2000));
        assert_eq!(safe_count_opt(Some(50)), None);
        assert_eq!(safe_count_opt(None), None);
    }
}
