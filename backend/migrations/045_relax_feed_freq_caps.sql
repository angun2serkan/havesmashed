-- ============================================================
-- feed_native ve forum_thread placement'larından enforce edilen
-- frekans kapanlarını kaldır.
-- ------------------------------------------------------------
-- "Bir kullanıcıya günde sadece 1 reklam göster" + "2 saat ara
-- bırak" politikası envanteri yapay olarak daraltıyordu; brand'in
-- bütçesi serve edilemeden duruyordu. Yeni politika: serve
-- edilebilecek reklam varsa göster — gerçek tüketim impression
-- counter + total_budget aggregator üzerinden yönetilir.
--
-- gated_interstitial ve push farklı semantikteki (gate spam,
-- push notification spam) kapanları korur — onlar `frequency_cap_per_day`
-- / `frequency_cap_per_user_per_week` gibi farklı key'ler kullanır
-- ve bu migration onları etkilemez.
--
-- Backend `ads.rs::cap_passes` mantığı duruyor: ilgili key DB'de
-- yoksa sessiz no-op. Operatör ileride panel üzerinden yeniden
-- açmak isterse hazır.
-- ============================================================

UPDATE ad_placements
SET display_rules = display_rules
    - 'frequency_cap_per_session'
    - 'min_gap_minutes'
WHERE key IN ('feed_native', 'forum_thread', 'badge_sponsor');
