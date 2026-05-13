-- ============================================================
-- badges.tier'a 'premium' değerini ekle
-- ------------------------------------------------------------
-- Brand sponsorlu badge'ler (campaign_id NOT NULL) bronze/silver/gold
-- platform tier sıralamasının üstünde "premium" olarak işaretlenir.
-- Görsel olarak farklı render edilir (deep purple + magenta glow),
-- brand sözleşmesinin görsel ayrıcalığı bu satırla taşınır.
--
-- Karar: tier seçimi brand_admin'in elinde değil — backend create_campaign
-- handler'ı placement_key='badge_sponsor' kampanyalarını otomatik olarak
-- tier='premium' ile insert eder.
-- ============================================================

ALTER TABLE badges DROP CONSTRAINT IF EXISTS badges_tier_check;

ALTER TABLE badges
    ADD CONSTRAINT badges_tier_check
    CHECK (tier IN ('bronze', 'silver', 'gold', 'premium'));
