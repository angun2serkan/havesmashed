-- ============================================================
-- forum_topics'i "sponsorlu thread" konseptiyle genişlet.
-- ------------------------------------------------------------
-- Sponsorlu forum thread'leri artık /api/ads/next üzerinden değil,
-- normal forum_topics tablosunda gerçek satır olarak servis edilir.
-- Brand kampanyası onaylandığında ilgili forum_topics satırı
-- otomatik oluşturulur (handler'da). Pinned + sponsor_campaign_id
-- set olarak listenin tepesinde durur; kullanıcı tıkladığında
-- /forum/{id} ile aynı detay sayfası açılır, yorum yapabilir.
--
-- Değişiklikler:
--  * user_id NULL'a izin verir — sponsorlu topic'lerde author yok.
--  * image_url eklendi — forum thread görseli (hem organik hem
--    sponsorlu için kullanılabilir; bu sürümde sadece sponsorlu).
--  * sponsor_campaign_id NULL FK; set ise topic sponsorlu sayılır.
--  * CHECK: her topic en azından bir author veya bir sponsor taşımalı.
--  * ad_campaigns kampanyası hard-delete olursa topic da CASCADE düşer.
-- ============================================================

ALTER TABLE forum_topics
    ALTER COLUMN user_id DROP NOT NULL,
    ADD COLUMN image_url TEXT,
    ADD COLUMN sponsor_campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    ADD CONSTRAINT forum_topics_author_or_sponsor
        CHECK (user_id IS NOT NULL OR sponsor_campaign_id IS NOT NULL);

CREATE INDEX idx_forum_topics_sponsor
    ON forum_topics(sponsor_campaign_id)
    WHERE sponsor_campaign_id IS NOT NULL AND deleted_at IS NULL;
