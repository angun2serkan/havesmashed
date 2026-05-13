-- ============================================================
-- admin_users: multi-user admin auth (Faz 1, T1.4 — T0.3 kararı)
-- ------------------------------------------------------------
-- ADMIN_API_KEY statik secret'ı çok-kullanıcılı yapıya evriliyor.
-- super_admin + brand_admin rolleri; brand_admin'in brand_id'si
-- zorunlu, super_admin'in NULL.
--
-- T0.3 kararı:
--   * `must_change_password` — initial password ile yaratılan
--     kullanıcı ilk login'de zorunlu olarak şifresini değiştirmek
--     zorunda; super_admin geçici şifreyi bilse bile kalıcı sızıntı
--     yok.
--   * `password_changed_at` — son şifre değişikliği zamanı (audit/
--     "X gündür değişmedi" raporları için).
--   * `totp_secret` — YOK. 2FA MVP'de implement edilmiyor (T7.2'ye
--     ertelendi).
--
-- Ek olarak T3.5 (approval notification) için admin_notifications
-- tablosu da aynı migration'a alındı — küçük ve aynı domain.
-- ============================================================

CREATE TABLE admin_users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   VARCHAR(160) NOT NULL UNIQUE,
    password_hash           TEXT NOT NULL,
    display_name            VARCHAR(80) NOT NULL,
    role                    VARCHAR(20) NOT NULL
                            CHECK (role IN ('super_admin','brand_admin')),
    brand_id                UUID REFERENCES brands(id),
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password    BOOLEAN NOT NULL DEFAULT FALSE,
    password_changed_at     TIMESTAMPTZ,
    last_login_at           TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Rol-brand consistency: super_admin'in brand_id'si NULL,
    -- brand_admin'in brand_id'si zorunlu.
    CHECK ((role = 'super_admin' AND brand_id IS NULL)
        OR (role = 'brand_admin' AND brand_id IS NOT NULL))
);

CREATE INDEX idx_admin_users_brand
    ON admin_users(brand_id)
    WHERE brand_id IS NOT NULL;

CREATE INDEX idx_admin_users_active_email
    ON admin_users(email)
    WHERE is_active = TRUE;

-- ── admin_notifications (T3.5) ───────────────────────────────
-- Approval queue submission, password reset, budget threshold
-- gibi olaylarda admin'lere in-app bildirim. E-posta gönderim
-- altyapısı T7.1'e ertelendi — şimdilik sadece bu tablo + UI.
CREATE TABLE admin_notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id       UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    type                VARCHAR(40) NOT NULL,
        -- 'campaign_submitted','campaign_approved','campaign_rejected',
        -- 'budget_threshold_50','budget_threshold_80','budget_threshold_95',
        -- 'campaign_auto_paused_budget','password_reset_by_super', ...
    title               VARCHAR(160) NOT NULL,
    body                TEXT,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
        -- type-spesifik metadata: { campaign_id, brand_id, ... }
    read_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_notifications_unread
    ON admin_notifications(admin_user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX idx_admin_notifications_all
    ON admin_notifications(admin_user_id, created_at DESC);
