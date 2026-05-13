-- ============================================================
-- Gated interstitial placement (date_create gate)
-- ------------------------------------------------------------
-- Kullanıcı yeni date kaydı oluştururken "Kaydet" tıkladıktan
-- sonra, kayıt tamamlanmadan önce kısa süreli izlenen reklam.
-- Skip butonu N saniye sonra aktifleşir. Tamamlanınca veya
-- skip'lenince kayıt devam eder.
--
-- Default `is_globally_enabled = FALSE` — admin manuel açana
-- kadar mevcut date submit akışı değişmeden çalışır (graceful
-- rollout).
--
-- Anonimlik kontratı: bu placement diğerleriyle aynı agregat
-- sözleşmeye tabi — user_id hiçbir metric/extras blob'unda
-- yer almaz, sadece günlük totaller.
-- ============================================================

INSERT INTO ad_placements
    (key, display_name, description, creative_spec, display_rules,
     metrics_collected, is_globally_enabled, requires_auth)
VALUES (
    'gated_interstitial',
    'Gated Interstitial (Date Submit)',
    'Kullanıcı yeni date kaydı oluştururken "Kaydet" tıkladıktan sonra, kayıt tamamlanmadan önce kısa süreli izlenen reklam. Skip butonu N saniye sonra aktifleşir. Tamamlanınca veya skip''lenince kayıt devam eder.',
    '{"image_size":"1080x1920","title_max":50,"body_max":160,"cta_max":24,"video_url_optional":true}'::jsonb,
    '{"min_view_seconds":5,"skip_after_seconds":5,"frequency_cap_per_day":3,"frequency_cap_per_user_per_session":1,"new_user_grace_count":3}'::jsonb,
    '["impression","click","view_complete","skip","completion_seconds"]'::jsonb,
    FALSE,
    TRUE
);
