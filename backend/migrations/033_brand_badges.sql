-- ============================================================
-- Brand-owned sponsored badges
-- ------------------------------------------------------------
-- Brand_admin artık kendi badge'ini tasarlar (name, description,
-- icon, kategori, threshold, görsel + sponsor metadata). Onay akışı
-- ad_campaigns üzerinden: brand draft → pending_review → super
-- approve → badge user-facing aktif olur.
--
-- Lifecycle:
--   * status='draft'           — brand'in editliyor
--   * status='pending_review'  — super onayı bekliyor
--   * status='rejected'        — super reddetti
--   * status='active'          — user'a gözüküyor, unlock'lanabilir
--   * status='paused'          — kampanya pause (yeni unlock yok,
--                                 mevcut user_badges saklanır)
--   * status='archived'        — kampanya bitti (ends_at geçti);
--                                 yeni unlock yok, mevcut kazançlar
--                                 user kazandı kalır
--
-- Platform badge'leri (brand_id IS NULL) her zaman status='active'
-- olmalı — CHECK constraint bunu enforce eder.
-- ============================================================

ALTER TABLE badges
    ADD COLUMN status      VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','draft','pending_review','rejected','paused','archived')),
    ADD COLUMN campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE SET NULL;

-- Brand badge ↔ kampanya 1:1 — onay akışı kampanya statüsünden okunur.
CREATE UNIQUE INDEX idx_badges_one_per_campaign
    ON badges(campaign_id)
    WHERE campaign_id IS NOT NULL;

-- Brand badge'leri filtrelemek için (admin liste + serving).
CREATE INDEX idx_badges_brand_status
    ON badges(brand_id, status)
    WHERE brand_id IS NOT NULL;

-- User-facing serving — yalnız status='active' badge'ler hesaba katılır.
CREATE INDEX idx_badges_active
    ON badges(id)
    WHERE status = 'active';

-- Platform badge'i (brand_id IS NULL) campaign_id taşımamalı ve
-- status='active' olmalı. Brand badge'leri brand_id NOT NULL +
-- is_sponsored=TRUE olmalı.
ALTER TABLE badges
    ADD CONSTRAINT badges_platform_or_brand CHECK (
        (brand_id IS NULL AND campaign_id IS NULL AND status = 'active')
        OR
        (brand_id IS NOT NULL AND is_sponsored = TRUE)
    );
