-- ============================================================
-- Brand wallet + placement pricing + cron health
-- (BRAND_BALANCE_PLAN.md Faz 1)
-- ------------------------------------------------------------
-- Upfront paket satınalma modeli. Brand'in TL bakiyesi olur,
-- kampanya oluştururken/uzatırken anlık düşer. Per-impression
-- billing yok; impression hedefine ulaşan kampanyalar günlük
-- cron tarafından pause edilir.
--
-- Tüm tutarlar kuruş cinsinden bigint; UI'da TL gösterilir.
-- 100 TL katı zorunluluğu: balance ve girilen tutarlar
-- amount_cents % 10000 = 0 olmak zorunda.
-- ============================================================

-- placement_pricing'in GIST exclusion constraint'i için
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── brands tablosuna balance_cents ────────────────────────────
ALTER TABLE brands
    ADD COLUMN balance_cents BIGINT NOT NULL DEFAULT 0
        CHECK (balance_cents >= 0 AND balance_cents % 10000 = 0);

-- ── brand_wallet_transactions (immutable defter) ──────────────
CREATE TABLE brand_wallet_transactions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id                 UUID NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    kind                     VARCHAR(20) NOT NULL CHECK (kind IN (
                                'topup',     -- super yatırdı: balance += X
                                'purchase',  -- kampanya oluşturuldu: balance -= cost
                                'extend',    -- kampanya uzatıldı: balance -= extra_cost
                                'refund',    -- super manuel iade: balance += X
                                'adjust'     -- super manuel düzeltme: signed
                             )),
    amount_cents             BIGINT NOT NULL CHECK (amount_cents != 0 AND amount_cents % 10000 = 0),
    balance_after_cents      BIGINT NOT NULL CHECK (balance_after_cents >= 0),
    ref_kind                 VARCHAR(20),       -- 'campaign' veya NULL
    ref_id                   UUID,
    description              TEXT,
    admin_user_id            UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    actor_label              VARCHAR(80) NOT NULL,
    impersonating_brand_id   UUID REFERENCES brands(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_tx_brand_created
    ON brand_wallet_transactions(brand_id, created_at DESC);

CREATE INDEX idx_wallet_tx_ref
    ON brand_wallet_transactions(ref_kind, ref_id)
    WHERE ref_kind IS NOT NULL;

-- ── placement_pricing (sistem fiyat listesi, tarihçeli) ───────
CREATE TABLE placement_pricing (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    placement_key        VARCHAR(40) NOT NULL REFERENCES ad_placements(key) ON DELETE RESTRICT,
    pricing_model        VARCHAR(10) NOT NULL CHECK (pricing_model = 'cpm'),
    unit_price_cents     INTEGER NOT NULL CHECK (unit_price_cents > 0),
    effective_from       TIMESTAMPTZ NOT NULL,
    effective_to         TIMESTAMPTZ,
    admin_user_id        UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    actor_label          VARCHAR(80) NOT NULL,
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Aynı anda placement+model için tek aktif satır (overlap engellenir)
    EXCLUDE USING gist (
        placement_key WITH =,
        pricing_model WITH =,
        tstzrange(effective_from, effective_to) WITH &&
    )
);

CREATE INDEX idx_placement_pricing_active
    ON placement_pricing(placement_key)
    WHERE effective_to IS NULL;

-- Seed: 5 placement için başlangıç fiyatları (super sonradan değiştirir)
-- placement_key'lerin migration 022/026'da seedlendiği varsayılıyor.
INSERT INTO placement_pricing
    (placement_key, pricing_model, unit_price_cents, effective_from, actor_label, notes)
VALUES
    ('feed_native',        'cpm', 5000,  NOW(), 'migration:038', 'initial seed'),
    ('badge_sponsor',      'cpm', 15000, NOW(), 'migration:038', 'initial seed'),
    ('forum_thread',       'cpm', 3000,  NOW(), 'migration:038', 'initial seed'),
    ('push',               'cpm', 20000, NOW(), 'migration:038', 'initial seed'),
    ('gated_interstitial', 'cpm', 8000,  NOW(), 'migration:038', 'initial seed')
ON CONFLICT DO NOTHING;

-- ── ad_campaigns'a target_impressions ────────────────────────
ALTER TABLE ad_campaigns
    ADD COLUMN target_impressions INTEGER
        CHECK (target_impressions IS NULL OR target_impressions > 0);

-- ── cron_health_log ───────────────────────────────────────────
CREATE TABLE cron_health_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cron_name    VARCHAR(50) NOT NULL,
    event        VARCHAR(20) NOT NULL CHECK (event IN (
                    'ok',
                    'stale_observed',
                    'recovered',
                    'error'
                 )),
    detail       TEXT,
    observed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cron_health_log_cron_observed
    ON cron_health_log(cron_name, observed_at DESC);
