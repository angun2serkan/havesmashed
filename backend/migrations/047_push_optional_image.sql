-- push placement görselini opsiyonel yap.
-- `image_size` (zorunlu görsel) yerine `image_size_optional` (yüklenirse
-- kullanılır, yoksa fallback ikon) konvansiyonunu kullanıyoruz. Backend
-- validate_creative ve admin form fieldsFromSpec bu yeni suffix'i tanır.
UPDATE ad_placements
SET creative_spec = jsonb_set(
    creative_spec - 'image_size',
    '{image_size_optional}',
    '"512x512"'
)
WHERE key = 'push';
