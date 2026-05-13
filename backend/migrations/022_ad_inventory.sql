-- ============================================================
-- Reklam envanteri altyapısı (Faz 4.1)
-- ------------------------------------------------------------
-- Admin paneli üzerinden yönetilen tüm reklam altyapısının veri
-- modeli. Migration ve cron dışında bu kaynaklara dokunmak için
-- terminal/DB gerekmez — hepsi admin endpoint'leri üzerinden.
--
-- Anonimlik kontratı:
--   * Hiçbir tablo `user_id` veya hash'lenmiş tanımlayıcı içermez.
--   * `ad_metrics` ve `ad_placement_metrics` aggregate sayaçlardır;
--     impression-bazlı user-tied veri kalmaz.
--   * `affiliate_clicks` slug-bazlı toplam, tıklayan kullanıcı yok.
--   * Per-segment breakdown'lar admin sayfalarında k≥1000 guard ile
--     daily_metrics / segment_metrics üzerinden gösterilecek.
-- ============================================================

-- ── PLACEMENT REGISTRY ────────────────────────────────────────
-- Reklam türü kataloğu. Admin her birinin globalde açık/kapalı
-- olmasını, frekans cap'lerini, hangi datayı topladığını buradan
-- yönetir. Frontend'in fiziksel slot'ları bu key'lere bağlanır.
CREATE TABLE ad_placements (
    key                 VARCHAR(40) PRIMARY KEY,
    display_name        VARCHAR(80) NOT NULL,
    description         TEXT NOT NULL,
    preview_image_url   TEXT,
    creative_spec       JSONB NOT NULL,
    display_rules       JSONB NOT NULL,
    metrics_collected   JSONB NOT NULL,
    is_globally_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    requires_auth       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ
);

-- Seed — frontend'in kullanacağı 4 başlangıç placement'ı.
-- Hepsi default DISABLED; admin paneli üzerinden tek tek açılır.
INSERT INTO ad_placements
    (key, display_name, description, creative_spec, display_rules, metrics_collected)
VALUES
('feed_native',
 'Feed Native Card',
 'Dashboard feed''inde native kart slotuna girer. Görsel + başlık + kısa metin + CTA.',
 '{"image_size":"1200x600","title_max":40,"body_max":120,"cta_max":24}',
 '{"frequency_cap_per_session":1,"dwell_ms_for_impression":1500,"min_gap_minutes":120}',
 '["impression","click","dwell_ms"]'),
('badge_sponsor',
 'Sponsored Badge',
 'Mevcut bir badge''e sponsor logosu + brand ismi eklenir. Kullanıcı badge unlock''ladığında brand link''i tetiklenebilir.',
 '{"logo_size":"256x256","sponsor_name_max":24}',
 '{"frequency_cap_per_session":null}',
 '["impression","click","badge_claim"]'),
('forum_thread',
 'Sponsored Forum Thread',
 'Forum başlık listesinde pinned, "Sponsorlu" etiketli thread olarak görünür.',
 '{"title_max":80,"body_max":2000,"image_size":"1200x600"}',
 '{"frequency_cap_per_session":1}',
 '["impression","click","comment"]'),
('push',
 'Sponsored Push Notification',
 'Opt-in kullanıcılara segment hedefli push bildirim olarak gönderilir.',
 '{"title_max":50,"body_max":120,"image_size":"512x512"}',
 '{"frequency_cap_per_user_per_week":1}',
 '["sent","delivered","open","click"]');

-- ── KAMPANYALAR ──────────────────────────────────────────────
-- Bir brand'in belirli bir placement türünde yayınladığı creative
-- + targeting + bütçe paketi.
CREATE TABLE ad_campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_name      VARCHAR(80) NOT NULL,
    placement_key   VARCHAR(40) NOT NULL REFERENCES ad_placements(key),
    creative        JSONB NOT NULL,
    click_url       TEXT NOT NULL,
    target_segment  JSONB,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    daily_cap       INTEGER,
    weight          INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 1),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_dry_run      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,

    CHECK (ends_at > starts_at),
    CHECK (daily_cap IS NULL OR daily_cap > 0)
);

-- Ad serving sıcak path'i: WHERE placement_key=? AND is_active
-- AND NOW() BETWEEN starts_at AND ends_at sorguları için.
CREATE INDEX idx_ad_campaigns_active
    ON ad_campaigns(placement_key, is_active, starts_at, ends_at)
    WHERE is_active = TRUE AND is_dry_run = FALSE;

CREATE INDEX idx_ad_campaigns_brand ON ad_campaigns(brand_name);

-- ── AGGREGATE SAYAÇLARI ──────────────────────────────────────
-- Per-kampanya günlük sayaçlar. user_id YOK.
-- `extra` JSONB placement-spesifik metrikleri tutar
-- (dwell_ms_sum, badge_claims, push_opens, vs.)
CREATE TABLE ad_metrics (
    campaign_id     UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    impressions     INTEGER NOT NULL DEFAULT 0,
    clicks          INTEGER NOT NULL DEFAULT 0,
    extra           JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (campaign_id, date)
);

CREATE INDEX idx_ad_metrics_date ON ad_metrics(date);

-- Per-placement günlük sayaçlar — "feed_native bu hafta toplam ne?"
-- Per-kampanyadan bağımsız placement-türü performans dashboard'u
-- bu tablodan beslenir.
CREATE TABLE ad_placement_metrics (
    placement_key   VARCHAR(40) NOT NULL REFERENCES ad_placements(key),
    date            DATE NOT NULL,
    impressions     INTEGER NOT NULL DEFAULT 0,
    clicks          INTEGER NOT NULL DEFAULT 0,
    extra           JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (placement_key, date)
);

CREATE INDEX idx_ad_placement_metrics_date ON ad_placement_metrics(date);

-- ── AFFILIATE LİNKLERİ ───────────────────────────────────────
-- /go/:slug üzerinden brand'a yönlendiren UTM-strip + Referer-strip
-- redirector. Admin panelden slug yönetilir, click sayılır.
CREATE TABLE affiliate_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            VARCHAR(40) NOT NULL UNIQUE
                    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
    brand_name      VARCHAR(80) NOT NULL,
    target_url      TEXT NOT NULL,
    utm_campaign    VARCHAR(80),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

CREATE INDEX idx_affiliate_links_active ON affiliate_links(slug)
    WHERE is_active = TRUE;

-- Aggregate slug click sayacı — kim tıkladığı YOK.
CREATE TABLE affiliate_clicks (
    slug            VARCHAR(40) NOT NULL,
    date            DATE NOT NULL,
    count           INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (slug, date)
);

CREATE INDEX idx_affiliate_clicks_date ON affiliate_clicks(date);

-- ── AUDİT LOG ────────────────────────────────────────────────
-- Admin'in yaptığı her mutation buraya yazılır. before/after diff
-- ile "geçen hafta hangi kampanyalar değişti?" gibi sorular
-- cevaplanabilir.
CREATE TABLE ad_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor           VARCHAR(80) NOT NULL,
    action          VARCHAR(40) NOT NULL,
    target_id       UUID,
    target_kind     VARCHAR(40),
    diff            JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_audit_log_created ON ad_audit_log(created_at DESC);
CREATE INDEX idx_ad_audit_log_target ON ad_audit_log(target_kind, target_id);
