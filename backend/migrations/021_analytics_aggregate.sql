-- ============================================================
-- Aggregate analytics snapshots
-- ------------------------------------------------------------
-- These three tables are the only source of truth for any
-- pitch deck, advertiser dashboard, or public stats endpoint.
--
-- Anonymity contract:
--   * No user_id columns anywhere.
--   * `segment_metrics.cohort_size >= 1000` enforced at row level.
--   * Filled by daily cron from `users` / `dates` / `partners`,
--     respecting `users.analytics_opt_in = TRUE`.
--   * `event_counters` is filled by per-request middleware that
--     never persists user identifiers.
-- ============================================================

-- ── daily_metrics ──────────────────────────────────────────────
-- One row per day. Platform-wide top-line numbers.
CREATE TABLE daily_metrics (
    date                DATE PRIMARY KEY,
    total_users         INTEGER NOT NULL,        -- cumulative active users
    new_users           INTEGER NOT NULL,        -- users created on this day
    dau                 INTEGER NOT NULL,        -- distinct last_seen_at on this day
    mau                 INTEGER NOT NULL,        -- distinct last_seen_at in 30d window ending this day
    total_dates_logged  INTEGER NOT NULL,        -- cumulative non-deleted dates
    new_dates_logged    INTEGER NOT NULL,        -- dates created on this day
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── segment_metrics ───────────────────────────────────────────
-- Cohort sizes for advertiser-facing segments. Hard floor at 1000.
CREATE TABLE segment_metrics (
    date            DATE NOT NULL,
    segment_key     VARCHAR(80) NOT NULL,        -- e.g. 'active_dater_30d', 'top_city_dates'
    segment_value   VARCHAR(80) NOT NULL,        -- e.g. 'true', 'istanbul', '5_plus'
    cohort_size     INTEGER NOT NULL CHECK (cohort_size >= 1000),
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (date, segment_key, segment_value)
);

CREATE INDEX idx_segment_metrics_date ON segment_metrics(date);
CREATE INDEX idx_segment_metrics_key ON segment_metrics(segment_key, date);

-- ── event_counters ────────────────────────────────────────────
-- Anonymous per-day, per-event-type counters. NEVER stores user_id.
-- Populated by middleware buffering in Redis, flushed hourly.
CREATE TABLE event_counters (
    date            DATE NOT NULL,
    event_type      VARCHAR(40) NOT NULL,
    city_id         INTEGER REFERENCES cities(id),  -- NULL = no geographic dimension
    count           BIGINT NOT NULL DEFAULT 0,
    -- NULLS NOT DISTINCT requires Postgres 15+; we run 16+.
    UNIQUE NULLS NOT DISTINCT (date, event_type, city_id)
);

CREATE INDEX idx_event_counters_date ON event_counters(date);
CREATE INDEX idx_event_counters_type ON event_counters(event_type, date);
