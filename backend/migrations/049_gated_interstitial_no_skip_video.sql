-- ============================================================
-- gated_interstitial placement güncellemeleri:
--   1) Skip kaldırıldı  → display_rules.skip_after_seconds yok
--   2) Video desteği eklendi → creative_spec.video_max_seconds = 30
--      (video_url_optional booleanı admin formu tarafından okunmuyordu;
--       yeni *_max_seconds konvansiyonu video upload widget'ını
--       tetikler ve süre limitini hem UI hem doğrulama için sağlar)
-- ============================================================

UPDATE ad_placements
SET creative_spec = (creative_spec - 'video_url_optional')
                  || '{"video_max_seconds": 30}'::jsonb,
    display_rules = display_rules - 'skip_after_seconds',
    metrics_collected = COALESCE(
        (SELECT jsonb_agg(elem)
         FROM jsonb_array_elements(metrics_collected) AS elem
         WHERE elem <> '"skip"'::jsonb),
        '[]'::jsonb
    )
WHERE key = 'gated_interstitial';
