-- ============================================================
-- brand_placement_grants tablosundan kullanılmayan cap alanlarını drop.
-- ------------------------------------------------------------
-- Placement paketleri (duration_months + tier bundle) artık impression
-- ve eşzamanlılık kontrolünü kendi içlerinde tanımlıyor; grant satırı
-- yalnızca "bu marka bu placement'a kampanya açabilir mi" sorusuna
-- cevap veriyor. max_concurrent ve monthly_impression_cap hiçbir
-- enforcement path'inde okunmuyordu — UI'da operatörü yanıltıyordu.
--
-- CHECK constraint'leri kolonla birlikte düşer.
-- ============================================================

ALTER TABLE brand_placement_grants
    DROP COLUMN IF EXISTS max_concurrent,
    DROP COLUMN IF EXISTS monthly_impression_cap;
