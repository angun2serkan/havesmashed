-- ============================================================
-- affiliate_links'e operatör-okur "name" alanı.
-- ------------------------------------------------------------
-- Slug URL'in son parçası — kullanıcı arayüzünde okunması güç
-- ("durex-q2-2026"). Brand operatörünün kampanya URL alanında
-- affiliate seçerken hatırlanabilir bir etiket görmesi için
-- 1..=80 karakterlik bir isim eklendi. NULL'a izin verilir;
-- eski satırlar için slug fallback'i frontend tarafında yapılır.
-- ============================================================

ALTER TABLE affiliate_links
    ADD COLUMN name VARCHAR(80)
        CHECK (name IS NULL OR (length(btrim(name)) BETWEEN 1 AND 80));
