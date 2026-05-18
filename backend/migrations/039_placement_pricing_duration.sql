-- ============================================================
-- placement_pricing tier'lere göre (1/3/6/12 ay)
-- ad_campaigns'a duration_months snapshot kolonu
-- ------------------------------------------------------------
-- Her placement için artık 4 ayrı aktif fiyat satırı tutulur
-- (1/3/6/12 aylık tier). Brand kampanya açarken/uzatırken bu
-- tier'i seçer; fiyat (placement, duration) ikilisinden okunur.
--
-- Mevcut tek-fiyatlı aktif satırlar `duration_months=1` olarak
-- backfill edilir; 3/6/12 tier'leri aynı fiyatla seedlenir,
-- super_admin sonradan ayarlar.
-- ============================================================

-- 1. Eski GIST exclude'u kaldır. Constraint adı PG otomatik üretti
--    (tablonun tek exclude constraint'i) — adı dinamik bulup düşür.
DO $$
DECLARE
    cn TEXT;
BEGIN
    SELECT conname INTO cn
    FROM pg_constraint
    WHERE conrelid = 'placement_pricing'::regclass
      AND contype = 'x';
    IF cn IS NOT NULL THEN
        EXECUTE format('ALTER TABLE placement_pricing DROP CONSTRAINT %I', cn);
    END IF;
END$$;

-- 2. duration_months kolonu ekle (default 1, backfill için)
ALTER TABLE placement_pricing
    ADD COLUMN duration_months SMALLINT NOT NULL DEFAULT 1
        CHECK (duration_months IN (1, 3, 6, 12));

-- 3. Default'u kaldır — yeni satırlar explicit vermek zorunda
ALTER TABLE placement_pricing
    ALTER COLUMN duration_months DROP DEFAULT;

-- 4. GIST exclude'u duration_months ile yeniden kur
ALTER TABLE placement_pricing
    ADD CONSTRAINT placement_pricing_unique_active EXCLUDE USING gist (
        placement_key WITH =,
        pricing_model WITH =,
        duration_months WITH =,
        tstzrange(effective_from, effective_to) WITH &&
    );

-- 5. Aktif satır index'i güncelle (drop + recreate)
DROP INDEX IF EXISTS idx_placement_pricing_active;
CREATE INDEX idx_placement_pricing_active
    ON placement_pricing(placement_key, duration_months)
    WHERE effective_to IS NULL;

-- 6. Eksik tier'leri seedle — her aktif (placement, 1) satırı için
--    3/6/12 ay tier'lerini aynı fiyatla insert et.
INSERT INTO placement_pricing
    (placement_key, pricing_model, unit_price_cents, duration_months,
     effective_from, actor_label, notes)
SELECT pp.placement_key, 'cpm', pp.unit_price_cents, m.duration_months,
       NOW(), 'migration:039_placement_pricing_duration',
       'auto-seeded from 1-month tier; super_admin can override'
FROM placement_pricing pp
CROSS JOIN (VALUES (3::SMALLINT), (6::SMALLINT), (12::SMALLINT)) AS m(duration_months)
WHERE pp.effective_to IS NULL
  AND pp.duration_months = 1
  AND NOT EXISTS (
      SELECT 1 FROM placement_pricing pp2
      WHERE pp2.placement_key = pp.placement_key
        AND pp2.duration_months = m.duration_months
        AND pp2.effective_to IS NULL
  );

-- 7. ad_campaigns snapshot kolonu (legacy kampanyalar NULL kalır)
ALTER TABLE ad_campaigns
    ADD COLUMN duration_months SMALLINT
        CHECK (duration_months IS NULL OR duration_months IN (1, 3, 6, 12));
