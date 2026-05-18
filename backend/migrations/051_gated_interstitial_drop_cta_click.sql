-- gated_interstitial:
--   * CTA buton metni kaldırıldı (modal'da label sabit "Devam et").
--   * Click URL anlamlı değil — gate dış link'e gitmiyor, sadece date
--     submit'i ilerletiyor. metrics_collected'tan 'click' düşürüyoruz.
UPDATE ad_placements
SET creative_spec = creative_spec - 'cta_max',
    metrics_collected = COALESCE(
        (SELECT jsonb_agg(elem)
         FROM jsonb_array_elements(metrics_collected) AS elem
         WHERE elem <> '"click"'::jsonb),
        '[]'::jsonb
    )
WHERE key = 'gated_interstitial';
