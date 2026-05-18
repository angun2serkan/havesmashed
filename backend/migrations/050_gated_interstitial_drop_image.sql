-- gated_interstitial creative_spec'inden image_size kaldırılır.
-- Görsel artık desteklenmiyor; placement yalnızca video alır.
-- Brand video yüklemezse modal placeholder fallback gösterir.
UPDATE ad_placements
SET creative_spec = creative_spec - 'image_size'
WHERE key = 'gated_interstitial';
