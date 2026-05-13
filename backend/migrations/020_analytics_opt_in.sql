-- ============================================================
-- Analytics opt-in flag
-- ------------------------------------------------------------
-- Adds a per-user toggle so that users who opt out are excluded
-- from aggregate analytics and advertiser-facing metrics.
--
-- Default: TRUE (existing users included). Disclosed in privacy
-- policy. Users can flip it from Settings at any time.
--
-- Anonymity contract: this column is a *user preference*, not
-- demographic enrichment. It is the only PII-adjacent boolean
-- that aggregate cron jobs are allowed to read from `users`.
-- ============================================================

ALTER TABLE users
    ADD COLUMN analytics_opt_in BOOLEAN NOT NULL DEFAULT TRUE;

-- Partial index — opt-out is the rare case, so index only those
-- rows. Aggregate cron filters with `WHERE analytics_opt_in`,
-- which Postgres rewrites against this index efficiently when
-- selectivity is high.
CREATE INDEX idx_users_analytics_opt_out
    ON users(id) WHERE analytics_opt_in = FALSE;
