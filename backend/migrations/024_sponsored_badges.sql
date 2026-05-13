-- ============================================================
-- Sponsored badge support
-- ------------------------------------------------------------
-- Mevcut bir badge'e sponsor logosu + click URL bağlanabilir.
-- "Durex 50 Date Master" gibi sponsor branding.
--
-- Anonimlik kontratı: bu kolonlar brand-tarafı reklam metadata'sı,
-- kullanıcı verisi değil. user_badges tablosu (kullanıcı-badge
-- ilişkisi) hiç değişmez — kim hangi badge'i unlock'lamış brand'a
-- gitmez. Brand sadece aggregate `badge_claim` event sayıları
-- görür (Faz 4.5'te /api/ads/event ile zaten destekleniyor).
-- ============================================================

ALTER TABLE badges
    ADD COLUMN is_sponsored      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN sponsor_name      VARCHAR(80),
    ADD COLUMN sponsor_click_url TEXT,
    ADD COLUMN sponsor_logo_url  TEXT;

-- Eğer is_sponsored TRUE ise diğer üç alanın dolu olması istenir;
-- ama strict CHECK koymuyoruz çünkü admin önce flag'i açıp sonra
-- doldurmak isteyebilir. UI tarafında zorunlu tutulur.

CREATE INDEX idx_badges_sponsored ON badges(id) WHERE is_sponsored = TRUE;
