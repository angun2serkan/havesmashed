-- ============================================================
-- ad_campaigns: brand_id + status + soft delete + budget alanları
-- (Faz 1, T1.2 — T0.1, T0.2, T0.4 kararlarının schema yansıması)
-- ------------------------------------------------------------
-- Tek migration'da 4 farklı eklemeyi yapıyoruz çünkü hepsi yeni
-- kolonlar — backward compat sorun değil ve tek bir review noktası.
--
-- T0.1 (manual approval):  status kolonu eklenir, is_active korunur
--                          (eski ad serving query'leri bir sürüm daha
--                          çalışsın diye). Status default 'draft';
--                          mevcut kayıtlar is_active'e göre 'active'/
--                          'paused' olarak backfill edilir.
-- T0.2 (soft delete):      deleted_at TIMESTAMPTZ NULL; ad serving ve
--                          listing query'leri filtreler.
-- T0.4 (hybrid budget):    pricing_model + unit_price_cents +
--                          total_budget_cents + spent_cents +
--                          last_alert_threshold + paused_reason.
--                          Budget aggregator cron (T2.10) yazar.
-- ============================================================

ALTER TABLE ad_campaigns
    -- T1.2 — brand_id (nullable önce; backfill sonra NOT NULL)
    ADD COLUMN brand_id UUID REFERENCES brands(id),

    -- T0.1 — status state machine
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','pending_review','active','paused','rejected')),

    -- T0.2 — soft delete
    ADD COLUMN deleted_at TIMESTAMPTZ,

    -- T0.4 — pricing + budget
    ADD COLUMN pricing_model VARCHAR(10)
        CHECK (pricing_model IS NULL OR pricing_model IN ('cpm','cpc','flat')),
    ADD COLUMN unit_price_cents INTEGER,
    ADD COLUMN total_budget_cents BIGINT,
    ADD COLUMN spent_cents BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN last_alert_threshold SMALLINT,
    ADD COLUMN paused_reason VARCHAR(30);

-- Backfill brand_id: brand_name string'leri brands.display_name ile eşleşiyor
UPDATE ad_campaigns c
SET brand_id = b.id
FROM brands b
WHERE c.brand_name = b.display_name
  AND c.brand_id IS NULL;

-- Eşleşmeyen kayıt kalırsa migration NOT NULL'a çevirirken patlar
-- (manuel müdahale gerekir). Boş ad_campaigns'lı sistemler için sorun yok.
DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphan_count FROM ad_campaigns WHERE brand_id IS NULL;
    IF orphan_count > 0 THEN
        RAISE EXCEPTION 'brand_id backfill failed: % campaigns have no matching brand', orphan_count;
    END IF;
END $$;

-- brand_id artık zorunlu
ALTER TABLE ad_campaigns ALTER COLUMN brand_id SET NOT NULL;

-- T0.1 status backfill: is_active'e göre eski kayıtları doldur
-- (yeni create'lerde default 'draft' kalır)
UPDATE ad_campaigns
SET status = CASE WHEN is_active THEN 'active' ELSE 'paused' END
WHERE status = 'draft' AND created_at < NOW();

-- T0.4 pricing consistency: cpm/cpc için unit_price + total_budget zorunlu
ALTER TABLE ad_campaigns ADD CONSTRAINT ad_campaigns_pricing_consistency
    CHECK (
        pricing_model IS NULL  -- legacy / 'flat' öncesi geçiş
        OR pricing_model = 'flat'
        OR (pricing_model IN ('cpm','cpc')
            AND unit_price_cents IS NOT NULL AND unit_price_cents > 0
            AND total_budget_cents IS NOT NULL AND total_budget_cents > 0)
    );

-- ── İndeksler ─────────────────────────────────────────────────

-- Brand-scoped listing (Faz 2 query pattern)
CREATE INDEX idx_ad_campaigns_brand_id ON ad_campaigns(brand_id);

-- T0.2 — soft delete listing filter hızlandırma
CREATE INDEX idx_ad_campaigns_not_deleted
    ON ad_campaigns(brand_id, status)
    WHERE deleted_at IS NULL;

-- T0.1 — status-based ad serving (status='active' WHERE clause'unun hot path'i)
-- Mevcut idx_ad_campaigns_active eski is_active'e bağlı, koruyoruz ama yeni
-- query'ler bu indeksi kullanacak.
CREATE INDEX idx_ad_campaigns_serving
    ON ad_campaigns(placement_key, status, starts_at, ends_at)
    WHERE status = 'active' AND deleted_at IS NULL AND is_dry_run = FALSE;

-- T0.4 — Cron job yalnız aktif cpm/cpc'leri tarar
CREATE INDEX idx_ad_campaigns_budget_tracking
    ON ad_campaigns(id)
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND pricing_model IN ('cpm','cpc');
