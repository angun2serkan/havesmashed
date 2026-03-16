-- Clear old badges and user_badges (dev only)
DELETE FROM user_badges;
DELETE FROM badges;

-- Update gender CHECK to include 'lgbt'
ALTER TABLE badges DROP CONSTRAINT IF EXISTS badges_gender_check;
ALTER TABLE badges ADD CONSTRAINT badges_gender_check CHECK (gender IN ('male', 'female', 'lgbt', 'both'));

-- Male badges (earned by dating women)
INSERT INTO badges (id, name, description, icon, category, threshold, gender) VALUES
    (1,  'Centilmen',       'İlk kadınla date',                    '🤵', 'dates', 1,  'male'),
    (2,  'Playboy',         '5 kadınla date',                      '🃏', 'dates', 5,  'male'),
    (3,  'Casanova',        '15 kadınla date',                     '🎭', 'dates', 15, 'male'),
    (4,  'Don Juan',        '30 kadınla date',                     '🗡️', 'dates', 30, 'male'),
    (5,  'Harem Sultan',    '50 kadınla date',                     '👑', 'dates', 50, 'male');

-- Female badges (earned by dating men)
INSERT INTO badges (id, name, description, icon, category, threshold, gender) VALUES
    (6,  'İlk Buluşma',    'İlk erkekle date',                    '💄', 'dates', 1,  'female'),
    (7,  'Heartbreaker',    '5 erkekle date',                      '💔', 'dates', 5,  'female'),
    (8,  'Femme Fatale',    '15 erkekle date',                     '🖤', 'dates', 15, 'female'),
    (9,  'Kleopatra',       '30 erkekle date',                     '👸', 'dates', 30, 'female'),
    (10, 'Afrodit',         '50 erkekle date',                     '🔱', 'dates', 50, 'female');

-- LGBT badges (earned by dating both genders or 'other')
INSERT INTO badges (id, name, description, icon, category, threshold, gender) VALUES
    (11, 'Meraklı',         'İlk other date veya her iki cinsle de date', '🌈', 'dates', 1, 'lgbt'),
    (12, 'Keşifçi',         'Hem erkek hem kadınla toplam 5 date',        '🦄', 'dates', 5, 'lgbt'),
    (13, 'Özgür Ruh',       'Hem erkek hem kadınla toplam 15 date',       '🔮', 'dates', 15, 'lgbt');

-- General explore badges
INSERT INTO badges (id, name, description, icon, category, threshold, gender) VALUES
    (14, 'Gezgin',           '3 farklı ülkede date',               '🌍', 'explore', 3,  'both'),
    (15, 'Dünya Vatandaşı',  '10 farklı ülkede date',              '✈️', 'explore', 10, 'both'),
    (16, 'Şehir Avcısı',    '5 farklı şehirde date',              '🏙️', 'explore', 5,  'both'),
    (17, 'Metropol',         '15 farklı şehirde date',             '🗺️', 'explore', 15, 'both');

-- General quality & social badges
INSERT INTO badges (id, name, description, icon, category, threshold, gender) VALUES
    (18, 'Yüksek Standart', 'Ortalama puanın 8+ (min 5 date)',    '🎯', 'quality', 8,  'both'),
    (19, 'Sosyal Kelebek',  '5 arkadaş edin',                      '🦋', 'social',  5,  'both');

SELECT setval('badges_id_seq', 19);
