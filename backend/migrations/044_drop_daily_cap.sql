-- ============================================================
-- ad_campaigns.daily_cap kaldırılır.
-- ------------------------------------------------------------
-- Placement paketleri (duration_months + tier bundle) artık reklamın
-- ne kadar serve edileceğini included_impressions + total_budget_cents
-- üzerinden tanımlıyor. Günlük yapay tavan koymak hem brand'in
-- tüketim hızını yapay olarak yavaşlatıyordu hem de operatör
-- arayüzünde fazladan bir karar düğmesi yaratıyordu. ads.rs içindeki
-- bugünkü impression sayım filtresi de bu kolonla birlikte düşer.
-- ============================================================

ALTER TABLE ad_campaigns
    DROP COLUMN IF EXISTS daily_cap;
