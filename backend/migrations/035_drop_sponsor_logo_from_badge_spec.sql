-- ============================================================
-- badge_sponsor placement: sponsor_logo_size kolonunu spec'ten çıkar
-- ------------------------------------------------------------
-- Karar: brand kendi badge'inin ana görselini zaten yüklüyor;
-- ek bir "sponsor logosu" tutmak fazlalık ve UX'i karıştırıyor.
-- Sponsor'ın görünürlüğü "Sponsored by <brand>" text'i ile yeterli.
--
-- Schema'da badges.sponsor_logo_url kolonu duruyor (eski super-only
-- "platform badge'ine sponsor iliştir" akışı bu kolonu hâlâ kullanır).
-- Yeni brand_admin self-serve akışında bu alan dolmaz.
-- ============================================================

UPDATE ad_placements
SET creative_spec = jsonb_build_object('sponsor_name_max', 24)
WHERE key = 'badge_sponsor';
