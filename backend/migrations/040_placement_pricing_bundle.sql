-- ============================================================
-- placement_pricing'e included_impressions kolonu.
-- ------------------------------------------------------------
-- Her tier artık bir "paket" tanımı: (süre, impression sayısı, CPM).
-- Brand create akışında impression girişi yok — tier seçimi paketi
-- belirler. Extend yine impression-only, kampanyanın kilitli CPM'inden
-- ücretlenir.
--
-- Mevcut aktif satırlar için varsayılan değerler seedlenir; super_admin
-- her tier'i UI'dan kendi paket büyüklüğüne göre ayarlar.
-- ============================================================

-- 1. Kolonu NULL olarak ekle, sonra backfill, sonra NOT NULL'a çek
ALTER TABLE placement_pricing
    ADD COLUMN included_impressions INTEGER
        CHECK (included_impressions IS NULL OR included_impressions > 0);

-- 2. Aktif satırları tier'lerine göre backfill et (placeholder paket büyüklüğü)
UPDATE placement_pricing
SET included_impressions = CASE duration_months
    WHEN 1  THEN 50000
    WHEN 3  THEN 150000
    WHEN 6  THEN 350000
    WHEN 12 THEN 700000
    ELSE 50000
END
WHERE included_impressions IS NULL
  AND effective_to IS NULL;

-- 3. Geçmiş (effective_to NOT NULL) satırlar için de sıfırdan kurtaran
--    bir değer koy — tarihçe için CHECK constraint'i sağlasın
UPDATE placement_pricing
SET included_impressions = CASE duration_months
    WHEN 1  THEN 50000
    WHEN 3  THEN 150000
    WHEN 6  THEN 350000
    WHEN 12 THEN 700000
    ELSE 50000
END
WHERE included_impressions IS NULL;

-- 4. Artık NOT NULL — yeni inserts explicit vermek zorunda
ALTER TABLE placement_pricing
    ALTER COLUMN included_impressions SET NOT NULL;
