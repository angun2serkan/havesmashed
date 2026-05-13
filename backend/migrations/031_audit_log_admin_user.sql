-- ============================================================
-- ad_audit_log: admin_user_id + impersonating + brand_id
-- (Faz 2, T2.5)
-- ------------------------------------------------------------
-- Mevcut ad_audit_log.actor (VARCHAR(80)) korunur — display_name
-- cache'i olarak kalır. Buna ek olarak:
--
--   * admin_user_id  → kim yaptı (admin_users FK)
--   * impersonating_brand_id → super_admin "act as brand X" modunda
--     mutasyon yaptıysa hangi brand adına yaptı (forensics kritik)
--   * brand_id       → denormalized: bu kayıt hangi brand'i etkiledi
--     (brand_admin audit log listing'i bu kolon ile filtrelenir,
--     join'siz hızlı; campaigns/affiliate join'i mantıken aynı sonucu
--     verir ama her query'de join atmak zorunda kalmayalım)
-- ============================================================

ALTER TABLE ad_audit_log
    ADD COLUMN admin_user_id UUID REFERENCES admin_users(id),
    ADD COLUMN impersonating_brand_id UUID REFERENCES brands(id),
    ADD COLUMN brand_id UUID REFERENCES brands(id);

CREATE INDEX idx_ad_audit_admin_user
    ON ad_audit_log(admin_user_id, created_at DESC)
    WHERE admin_user_id IS NOT NULL;

CREATE INDEX idx_ad_audit_brand
    ON ad_audit_log(brand_id, created_at DESC)
    WHERE brand_id IS NOT NULL;
