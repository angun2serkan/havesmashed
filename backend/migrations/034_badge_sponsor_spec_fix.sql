-- ============================================================
-- badge_sponsor placement creative_spec düzeltmesi
-- ------------------------------------------------------------
-- Frontend `fieldsFromSpec` helper'ı `<base>_size` anahtarını
-- `<base>_url` form alanına çeviriyor. Önceki seed `logo_size`
-- kullanıyordu → `logo_url` field'ı üretiyordu; backend ise
-- `sponsor_logo_url` bekliyor → uyumsuzluk yüzünden upload
-- edilen logo body'ye doğru anahtarla gitmiyordu.
--
-- `sponsor_logo_size` olarak yeniden adlandırıyoruz; bu sayede
-- frontend `sponsor_logo_url` field'ı üretip yüklemeyi orada
-- saklıyor, backend de aynı anahtardan okuyor.
-- ============================================================

UPDATE ad_placements
SET creative_spec = jsonb_build_object(
        'sponsor_logo_size', '256x256',
        'sponsor_name_max', 24
    )
WHERE key = 'badge_sponsor';
