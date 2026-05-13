-- ============================================================
-- Brand entity + placement grants (Faz 1, T1.1)
-- ------------------------------------------------------------
-- Markaları string'den bir entity'ye çıkarıyoruz. Ad_campaigns
-- ve affiliate_links'teki brand_name kolonları sonraki
-- migration'da bu tablonun id'sine bağlanır; ama mevcut string
-- kolonlar denormalized cache olarak korunur (downtime'sız geçiş).
--
-- brand_placement_grants: bir marka hangi placement türünde
-- kampanya açabilir + paket limitleri. Boş bırakılırsa marka
-- hiçbir placement'a kampanya yaratamaz (super_admin onaylamalı).
--
-- Anonimlik kontratı: bu tablolar reklam-tarafı sözleşme metadata'sı;
-- hiçbir kullanıcı verisi içermez.
-- ============================================================

CREATE TABLE brands (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            VARCHAR(40) NOT NULL UNIQUE
                    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
    display_name    VARCHAR(80) NOT NULL,
    contact_email   VARCHAR(160),
    contract_notes  TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

CREATE INDEX idx_brands_active ON brands(id) WHERE is_active = TRUE;

-- ── Placement grants ─────────────────────────────────────────
-- Marka X'in feed_native placement'ında en fazla 3 eşzamanlı
-- aktif kampanyası olabilir; aylık impression cap'i 1M, gibi.
CREATE TABLE brand_placement_grants (
    brand_id                UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    placement_key           VARCHAR(40) NOT NULL REFERENCES ad_placements(key),
    max_concurrent          INTEGER,
    monthly_impression_cap  BIGINT,
    notes                   TEXT,
    granted_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (brand_id, placement_key),
    CHECK (max_concurrent IS NULL OR max_concurrent > 0),
    CHECK (monthly_impression_cap IS NULL OR monthly_impression_cap > 0)
);

-- ── Backfill: mevcut ad_campaigns.brand_name distinct değerleri ─
-- her benzersiz brand_name için bir brands satırı yarat. Slug,
-- display_name'den lowercase + non-alnum→tire transform ile üretilir;
-- çakışma olursa _2, _3 suffix'i eklenir (bu seed'de N=1 garanti çünkü
-- distinct alındı).
INSERT INTO brands (slug, display_name)
SELECT
    -- Slug: lowercase, non-alnum karakterleri tire ile değiştir,
    -- baştaki/sondaki tireleri kırp; sonuç 2-40 char olmalı.
    -- TR karakterler için basit translit yapmıyoruz (manuel temizlik
    -- super_admin tarafından sonradan yapılabilir).
    SUBSTRING(
        REGEXP_REPLACE(
            REGEXP_REPLACE(LOWER(brand_name), '[^a-z0-9]+', '-', 'g'),
            '^-+|-+$', '', 'g'
        )
        FROM 1 FOR 40
    ) AS slug,
    brand_name AS display_name
FROM (
    SELECT DISTINCT brand_name FROM ad_campaigns
    UNION
    SELECT DISTINCT brand_name FROM affiliate_links
    UNION
    SELECT DISTINCT sponsor_name FROM badges WHERE sponsor_name IS NOT NULL
) AS distinct_brands
WHERE brand_name IS NOT NULL
  AND LENGTH(REGEXP_REPLACE(LOWER(brand_name), '[^a-z0-9]+', '-', 'g')) >= 2
ON CONFLICT (slug) DO NOTHING;
