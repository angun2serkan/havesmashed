// HTTP middleware that emits anonymous engagement counters.
//
// Maps the first path segment of the API to a coarse event_type
// ("dates", "forum", "feed", etc.) and bumps the corresponding
// `event_counters` row for today's date. NEVER inspects the request
// body, headers, or auth — only the URL path.
//
// Wired up in `main.rs` via `axum::middleware::from_fn_with_state`.

use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};

use crate::services::event_tracker;
use crate::AppState;

pub async fn track(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Response {
    let event_type = derive_event_type(req.uri().path()).map(|s| s.to_string());

    let response = next.run(req).await;

    // Only count successful interactions; 4xx/5xx skew engagement.
    if response.status().is_success() {
        if let Some(et) = event_type {
            let mut redis = state.redis.clone();
            tokio::spawn(async move {
                event_tracker::track_event(&mut redis, &et, None).await;
            });
        }
    }

    response
}

fn derive_event_type(path: &str) -> Option<&'static str> {
    let trimmed = path.strip_prefix("/api/").unwrap_or(path);
    let first = trimmed.split('/').next()?;
    match first {
        "auth" => Some("auth"),
        "dates" => Some("dates"),
        "forum" => Some("forum"),
        "feed" => Some("feed"),
        "friends" | "connections" | "invites" => Some("social"),
        "stats" => Some("stats"),
        "notifications" => Some("notifications"),
        "partners" => Some("partners"),
        "badges" => Some("badges"),
        // Admin / health / static lookups are not engagement signals.
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_known_prefixes() {
        assert_eq!(derive_event_type("/api/dates"), Some("dates"));
        assert_eq!(derive_event_type("/api/dates/abc"), Some("dates"));
        assert_eq!(derive_event_type("/api/forum/topics/1"), Some("forum"));
        assert_eq!(derive_event_type("/api/connections"), Some("social"));
    }

    #[test]
    fn ignores_unknown() {
        assert_eq!(derive_event_type("/api/admin/metrics"), None);
        assert_eq!(derive_event_type("/api/health"), None);
        assert_eq!(derive_event_type("/uploads/foo.png"), None);
    }
}
