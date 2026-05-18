-- ============================================================
-- Sponsored badge'ler için zengin/kombine kriter sistemi.
-- ------------------------------------------------------------
-- Mevcut category/threshold/gender modeli platform badge'leri için
-- yeterli; ancak sponsored badge'lerin date formundaki tüm alanları
-- (tag, gender, age_range, height_range, country, city, rating'ler)
-- kombine biçimde hedefleyebilmesi gerekiyor.
--
-- Yeni kolon: badges.criteria JSONB. NULL ise legacy (category/threshold)
-- yolu kullanılır. NOT NULL ise evaluator JSON spec'ini değerlendirir;
-- tüm condition'lar AND ile birleşir.
--
-- Şema (TypeScript karşılığı api.ts'de):
--   { conditions: [
--       { type: 'count',  min, filter },
--       { type: 'distinct', field: 'country_code'|'city_id', min, filter? },
--       { type: 'avg_rating', field: 'rating'|'face_rating'|'body_rating'|'chat_rating', min_avg, min_sample, filter? },
--       { type: 'friend_count', min }
--     ] }
-- ============================================================

ALTER TABLE badges
    ADD COLUMN criteria JSONB
        CHECK (criteria IS NULL OR jsonb_typeof(criteria) = 'object');

-- Aktif sponsored badge'leri evaluator'da bulmak için partial index.
CREATE INDEX idx_badges_criteria_active
    ON badges(id)
    WHERE criteria IS NOT NULL AND status = 'active';
