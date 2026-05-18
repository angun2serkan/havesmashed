-- ============================================================
-- Sponsored push notification placement'ını sistemden kaldır.
-- ------------------------------------------------------------
-- Delivery infrastructure (web push / FCM / cron dispatcher /
-- service worker) hiç yazılmamıştı; brand kampanya satın alsa
-- bile hiçbir kullanıcıya iletilmiyordu. Yanlış satışı önlemek
-- için placement'ı tamamen kaldırıyoruz.
--
-- Silme sırası FK kısıtlarına saygı duyar:
--   ad_campaigns           → placement_key REFERENCES ad_placements
--                            (ad_metrics CASCADE ile otomatik silinir)
--   ad_placement_metrics   → placement_key REFERENCES ad_placements
--   placement_pricing      → placement_key REFERENCES ad_placements (ON DELETE RESTRICT)
--                            (migration 039/040 aynı tabloya satır ekler)
--   brand_placement_grants → placement_key REFERENCES ad_placements
--   ad_placements          → pk
-- ============================================================

DELETE FROM ad_campaigns           WHERE placement_key = 'push';
DELETE FROM ad_placement_metrics   WHERE placement_key = 'push';
DELETE FROM placement_pricing      WHERE placement_key = 'push';
DELETE FROM brand_placement_grants WHERE placement_key = 'push';
DELETE FROM ad_placements          WHERE key = 'push';
