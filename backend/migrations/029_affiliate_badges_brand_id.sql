-- ============================================================
-- affiliate_links + badges: brand_id link + affiliate soft delete
-- (Faz 1, T1.3 — T0.2 kararı)
-- ------------------------------------------------------------
-- affiliate_links: brand_id NULLABLE (organik partner linkleri
-- olabilir, marka entity'ye bağlanmadan) + deleted_at (brand_admin
-- kendi slug'ını soft delete edebilir).
-- badges: brand_id NULLABLE (sponsored badge brand'a bağlanır,
-- organik badge'lerde NULL). Badge silme YOK (T0.2 kararı: badge
-- platform varlığı, brand sadece sponsor_* alanlarını boşaltabilir).
-- ============================================================

-- ── affiliate_links ──────────────────────────────────────────
ALTER TABLE affiliate_links
    ADD COLUMN brand_id UUID REFERENCES brands(id),
    ADD COLUMN deleted_at TIMESTAMPTZ;

-- Backfill brand_id: affiliate_links.brand_name → brands.display_name
UPDATE affiliate_links a
SET brand_id = b.id
FROM brands b
WHERE a.brand_name = b.display_name
  AND a.brand_id IS NULL;

CREATE INDEX idx_affiliate_links_brand_id
    ON affiliate_links(brand_id)
    WHERE brand_id IS NOT NULL;

CREATE INDEX idx_affiliate_links_not_deleted
    ON affiliate_links(slug)
    WHERE deleted_at IS NULL;

-- ── badges ───────────────────────────────────────────────────
ALTER TABLE badges
    ADD COLUMN brand_id UUID REFERENCES brands(id);

-- Backfill: badges.sponsor_name → brands.display_name
UPDATE badges b
SET brand_id = br.id
FROM brands br
WHERE b.sponsor_name = br.display_name
  AND b.brand_id IS NULL
  AND b.sponsor_name IS NOT NULL;

CREATE INDEX idx_badges_brand_id
    ON badges(brand_id)
    WHERE brand_id IS NOT NULL;
