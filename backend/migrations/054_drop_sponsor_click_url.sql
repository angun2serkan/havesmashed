-- ============================================================
-- badges.sponsor_click_url drop + click_url uniqueness ad_campaigns'a taşınır
-- ------------------------------------------------------------
-- Önceki model: brand badge yarattığında click_url hem
-- ad_campaigns.click_url'e hem badges.sponsor_click_url'e yazılıyordu
-- (duplicate). Yeni model: tek source of truth ad_campaigns.click_url.
-- Badge unlock akışı badges'i ad_campaigns ile JOIN edip click_url'i
-- buradan okur.
--
-- Aynı zamanda eski super-admin "set_badge_sponsor" endpoint'i
-- (PUT /api/admin/badges/{id}/sponsor) silindi — platform badge'ine
-- elle sponsor info retrofit etme yolu artık yok. Yeni model brand'in
-- kendi badge_sponsor kampanyasını açmasını şart koşuyor.
--
-- Uniqueness: brand_id NOT NULL ad_campaigns'da placement_key=
-- 'badge_sponsor' AND deleted_at IS NULL olan satırlar üzerinde
-- LOWER(click_url) unique. Aynı brand iki badge kampanyasını aynı
-- landing URL'ine yönlendiremez; brand'ler arası da aynı kuraldan
-- geçer.
-- ============================================================

ALTER TABLE badges
    DROP COLUMN sponsor_click_url;

CREATE UNIQUE INDEX idx_badge_sponsor_campaigns_click_url_lower
    ON ad_campaigns (LOWER(click_url))
    WHERE placement_key = 'badge_sponsor' AND deleted_at IS NULL;
