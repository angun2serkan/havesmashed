-- ============================================================
-- User-level ad opt-out flag
-- ------------------------------------------------------------
-- Per anonimlik kontratı: bu kolon demografik enrichment değil,
-- yalnızca kullanıcı tercihi. Settings sayfasından toggle ile
-- kontrol edilir; FALSE olduğunda backend `/api/ads/next` boş
-- döner ve hiçbir reklam gösterilmez (gated interstitial dahil).
--
-- Default TRUE — yeni ve mevcut kullanıcılar reklam görmeye
-- başlar; opt-out tek tıkla yapılabilir.
-- ============================================================

ALTER TABLE users
    ADD COLUMN show_ads BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX idx_users_show_ads_off
    ON users(id) WHERE show_ads = FALSE;
