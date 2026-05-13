-- ============================================================
-- Sponsor click counter for sponsored badges
-- ------------------------------------------------------------
-- Each tap on the "Presented by X" strip on an earned badge
-- increments this counter via POST /api/badges/:id/sponsor-click.
--
-- Anonimlik kontratı: tekil kullanıcı kaydı tutulmaz, sadece
-- toplam click sayısı artırılır. Brand bu sayıyı admin panel
-- üzerinden görür; ham event yok.
-- ============================================================

ALTER TABLE badges
    ADD COLUMN sponsor_click_count BIGINT NOT NULL DEFAULT 0;
