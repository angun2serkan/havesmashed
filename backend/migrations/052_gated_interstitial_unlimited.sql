-- gated_interstitial frekans kapanları kaldırıldı:
--   - frequency_cap_per_user_per_session
--   - frequency_cap_per_day
-- Artık her date submit'te (placement açık ve eligible kampanya varsa)
-- gate fire eder. Backend `cap_passes` mantığı zaten "key yoksa no-op"
-- olduğu için ek kod değişikliği gerekmez.
UPDATE ad_placements
SET display_rules = display_rules
    - 'frequency_cap_per_user_per_session'
    - 'frequency_cap_per_day'
WHERE key = 'gated_interstitial';
