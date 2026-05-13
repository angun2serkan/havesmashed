-- ============================================================
-- super_admin rolünü DB'den kaldır, env-tabanlı kimliğe geç
-- ------------------------------------------------------------
-- Artık super_admin kimliği `ADMIN_API_NAME` + `ADMIN_API_KEY`
-- env değişkenleri ile temsil edilir. admin_users tablosu yalnızca
-- brand_admin satırlarını tutar.
--
-- Audit log'da super_admin tarafından yapılan mutation'ların
-- admin_user_id FK referansı NULL'a çekilir (actor string'i
-- olduğu gibi kalır — "kim" bilgisi kayboluyormuş gibi gözükse de
-- yeni env-super akışında zaten admin_user_id atılmıyor, actor
-- alanındaki "env_super:<name>" karşılaştırılabilir).
-- ============================================================

-- 1. Mevcut super_admin'lerin audit log FK referanslarını gevşet.
UPDATE ad_audit_log
   SET admin_user_id = NULL
 WHERE admin_user_id IN (
       SELECT id FROM admin_users WHERE role = 'super_admin'
 );

-- 2. super_admin satırlarını sil — tek kaynağımız env oldu.
DELETE FROM admin_users WHERE role = 'super_admin';

-- 3. Yeni CHECK constraint: rol yalnızca brand_admin olabilir.
--    Mevcut anonim CHECK constraint'i koru — yeni named constraint
--    onunla bir arada çalışır (her ikisi de geçmek zorunda),
--    pratikte rol 'brand_admin' ve brand_id NOT NULL'da kilitlenir.
ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_brand_admin_only
  CHECK (role = 'brand_admin');
