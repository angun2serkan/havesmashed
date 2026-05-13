-- ============================================================
-- badge_shares: kullanıcının kazandığı badge'i paylaşma sayacı
-- ------------------------------------------------------------
-- Kullanıcı dashboard'undan bir earned badge'i arkadaşına paylaşmak
-- için "Linki kopyala" / "Mesajı kopyala" akışını tetikler. Bu event
-- backend'e bildirilir ve günlük aggregate olarak saklanır.
--
-- Anonimlik kontratı: user_id YOK. Yalnızca hangi badge'in hangi
-- günde kaç kez paylaşıldığı izlenir. Brand bu sayıyı aggregate
-- olarak görür ("Bumble badge'i son 30 günde 1240 kez paylaşıldı")
-- ama hangi kullanıcının paylaştığını bilmez.
-- ============================================================

CREATE TABLE badge_shares (
    badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    date     DATE NOT NULL,
    count    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (badge_id, date)
);

CREATE INDEX idx_badge_shares_date ON badge_shares(date DESC);
