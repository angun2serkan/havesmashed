-- ============================================================
-- Brand badge'leri arasında description özgünlüğü
-- ------------------------------------------------------------
-- Brand bir badge yarattığında, başka bir brand badge'i ile aynı
-- açıklamayı paylaşamaz. Case-insensitive (LOWER) karşılaştırma.
--
-- Scope: partial index — sadece brand_id IS NOT NULL satırlarına
-- uygulanır. Platform badge'leri (brand_id IS NULL) ile çakışma
-- kontrolü yapılmaz — onlar generic açıklamalar taşır.
--
-- badges.name zaten migration 007'de global UNIQUE; ilave constraint
-- gerekmedi.
--
-- click_url özgünlüğü migration 054'te ad_campaigns üzerinde tutulur
-- (badges.sponsor_click_url drop edilince).
-- ============================================================

CREATE UNIQUE INDEX idx_brand_badges_description_lower
    ON badges (LOWER(description))
    WHERE brand_id IS NOT NULL;
