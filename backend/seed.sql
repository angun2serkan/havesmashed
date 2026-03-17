-- ============================================================
-- havesmashedV2 -- Development Seed Data
-- Run: psql havesmashed < backend/seed.sql
-- ============================================================

-- Only seed if no users exist (fresh database)
DO $$
BEGIN
    IF (SELECT COUNT(*) FROM users) > 0 THEN
        RAISE NOTICE 'Database already has users, skipping seed data.';
        RETURN;
    END IF;

    -- ============================================
    -- USERS (5 test users)
    -- ============================================

    -- ahmet (phrase: abandon ability able about above absent absorb abstract absurd abuse access accident)
    INSERT INTO users (id, secret_hash, nickname, created_at, last_seen_at)
    VALUES (
        '00000000-0000-0000-0000-000000000001',
        encode(digest('abandon ability able about above absent absorb abstract absurd abuse access accident', 'sha256'), 'hex'),
        'ahmet',
        NOW() - INTERVAL '60 days',
        NOW() - INTERVAL '1 hour'
    );

    -- ayse (phrase: account accuse achieve acid acoustic acquire across action actor actual adapt address)
    INSERT INTO users (id, secret_hash, nickname, created_at, last_seen_at)
    VALUES (
        '00000000-0000-0000-0000-000000000002',
        encode(digest('account accuse achieve acid acoustic acquire across action actor actual adapt address', 'sha256'), 'hex'),
        'ayse',
        NOW() - INTERVAL '45 days',
        NOW() - INTERVAL '3 hours'
    );

    -- mehmet (phrase: adjust admit adult advance advice aerobic affair afford afraid again agent agree)
    INSERT INTO users (id, secret_hash, nickname, created_at, last_seen_at)
    VALUES (
        '00000000-0000-0000-0000-000000000003',
        encode(digest('adjust admit adult advance advice aerobic affair afford afraid again agent agree', 'sha256'), 'hex'),
        'mehmet',
        NOW() - INTERVAL '30 days',
        NOW() - INTERVAL '1 day'
    );

    -- sofia (phrase: ahead airport aisle alarm album alcohol alert alien allow almost alone alpha)
    INSERT INTO users (id, secret_hash, nickname, created_at, last_seen_at)
    VALUES (
        '00000000-0000-0000-0000-000000000004',
        encode(digest('ahead airport aisle alarm album alcohol alert alien allow almost alone alpha', 'sha256'), 'hex'),
        'sofia',
        NOW() - INTERVAL '50 days',
        NOW() - INTERVAL '2 hours'
    );

    -- can (phrase: already alter always amateur amazing among amount amused analyst anchor ancient anger)
    INSERT INTO users (id, secret_hash, nickname, created_at, last_seen_at)
    VALUES (
        '00000000-0000-0000-0000-000000000005',
        encode(digest('already alter always amateur amazing among amount amused analyst anchor ancient anger', 'sha256'), 'hex'),
        'can',
        NOW() - INTERVAL '10 days',
        NOW() - INTERVAL '5 hours'
    );

    -- ============================================
    -- CONNECTIONS (friends)
    -- ============================================

    -- ahmet <-> ayse (accepted)
    INSERT INTO connections (id, requester_id, responder_id, status, color, created_at)
    VALUES ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted', '#FF007F', NOW() - INTERVAL '40 days');

    -- ahmet <-> mehmet (accepted)
    INSERT INTO connections (id, requester_id, responder_id, status, color, created_at)
    VALUES ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'accepted', '#00E5FF', NOW() - INTERVAL '25 days');

    -- ayse <-> sofia (accepted)
    INSERT INTO connections (id, requester_id, responder_id, status, color, created_at)
    VALUES ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'accepted', '#39FF14', NOW() - INTERVAL '30 days');

    -- mehmet <-> sofia (accepted)
    INSERT INTO connections (id, requester_id, responder_id, status, color, created_at)
    VALUES ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', 'accepted', '#BF00FF', NOW() - INTERVAL '20 days');

    -- can <-> ahmet (accepted)
    INSERT INTO connections (id, requester_id, responder_id, status, color, created_at)
    VALUES ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'accepted', '#FFD700', NOW() - INTERVAL '8 days');

    -- ============================================
    -- DATES (realistic spread)
    -- City IDs looked up by name via subquery for safety.
    -- ============================================

    -- ahmet's dates (8 dates with women in Istanbul and other cities)
    INSERT INTO dates (id, user_id, country_code, city_id, gender, age_range, height_range, person_nickname, description, rating, face_rating, body_rating, chat_rating, date_at, created_at)
    VALUES
    ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'female', '23-27', '165-170', 'Elif', 'Kadikoy''de harika bir aksam yemegi', 8, 9, 8, 7, (NOW() - INTERVAL '55 days')::date, NOW() - INTERVAL '55 days'),
    ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'female', '28-32', '160-165', 'Zeynep', 'Bebek sahilinde yuruyus', 7, 8, 7, 8, (NOW() - INTERVAL '48 days')::date, NOW() - INTERVAL '48 days'),
    ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001', 'TR', (SELECT id FROM cities WHERE name='Ankara' LIMIT 1), 'female', '23-27', '170-175', 'Selin', 'Kizilay''da bulustuk guzel bir kahve', 6, 7, 6, 5, (NOW() - INTERVAL '40 days')::date, NOW() - INTERVAL '40 days'),
    ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000001', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'female', '18-22', '150-160', 'Deniz', 'Nisantasi''nda restoran, cok eglenceli', 9, 9, 8, 9, (NOW() - INTERVAL '30 days')::date, NOW() - INTERVAL '30 days'),
    ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000001', 'GB', (SELECT id FROM cities WHERE name='London' LIMIT 1), 'female', '23-27', '170-175', 'Emma', 'Covent Garden dinner', 8, 8, 7, 9, (NOW() - INTERVAL '20 days')::date, NOW() - INTERVAL '20 days'),
    ('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-000000000001', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'female', '28-32', '160-165', 'Aylin', 'Karakoy''de bar gecesi', 7, 7, 8, 6, (NOW() - INTERVAL '14 days')::date, NOW() - INTERVAL '14 days'),
    ('00000000-0000-0000-0002-000000000007', '00000000-0000-0000-0000-000000000001', 'DE', (SELECT id FROM cities WHERE name='Berlin' LIMIT 1), 'female', '23-27', '175-180', 'Lisa', 'Kreuzberg cafe, harika sohbet', 8, 8, 9, 8, (NOW() - INTERVAL '7 days')::date, NOW() - INTERVAL '7 days'),
    ('00000000-0000-0000-0002-000000000008', '00000000-0000-0000-0000-000000000001', 'TR', (SELECT id FROM cities WHERE name='Antalya' LIMIT 1), 'female', '23-27', '165-170', 'Melis', 'Kaleici''nde aksam yuruyusu', 9, 9, 9, 8, (NOW() - INTERVAL '3 days')::date, NOW() - INTERVAL '3 days');

    -- ayse's dates (6 dates with men in Istanbul and Ankara)
    INSERT INTO dates (id, user_id, country_code, city_id, gender, age_range, height_range, person_nickname, description, rating, face_rating, body_rating, chat_rating, date_at, created_at)
    VALUES
    ('00000000-0000-0000-0002-000000000011', '00000000-0000-0000-0000-000000000002', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'male', '28-32', '180-185', 'Kaan', 'Cihangir brunch, cok centilmen', 8, 8, 9, 7, (NOW() - INTERVAL '42 days')::date, NOW() - INTERVAL '42 days'),
    ('00000000-0000-0000-0002-000000000012', '00000000-0000-0000-0000-000000000002', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'male', '33-37', '175-180', 'Burak', 'Nisantasi''nda aksam yemegi', 6, 7, 7, 5, (NOW() - INTERVAL '35 days')::date, NOW() - INTERVAL '35 days'),
    ('00000000-0000-0000-0002-000000000013', '00000000-0000-0000-0000-000000000002', 'TR', (SELECT id FROM cities WHERE name='Ankara' LIMIT 1), 'male', '28-32', '185-190', 'Emre', 'Tunali''da kahve ve yuruyus', 7, 6, 8, 8, (NOW() - INTERVAL '28 days')::date, NOW() - INTERVAL '28 days'),
    ('00000000-0000-0000-0002-000000000014', '00000000-0000-0000-0000-000000000002', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'male', '23-27', '175-180', 'Arda', 'Karakoy''de bar, enerjik biri', 9, 9, 8, 9, (NOW() - INTERVAL '18 days')::date, NOW() - INTERVAL '18 days'),
    ('00000000-0000-0000-0002-000000000015', '00000000-0000-0000-0000-000000000002', 'FR', (SELECT id FROM cities WHERE name='Paris' LIMIT 1), 'male', '28-32', '180-185', 'Pierre', 'Le Marais''de romantik aksam', 9, 8, 8, 9, (NOW() - INTERVAL '10 days')::date, NOW() - INTERVAL '10 days'),
    ('00000000-0000-0000-0002-000000000016', '00000000-0000-0000-0000-000000000002', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'male', '28-32', '180-185', 'Onur', 'Moda sahili yuruyusu', 7, 7, 8, 7, (NOW() - INTERVAL '4 days')::date, NOW() - INTERVAL '4 days');

    -- mehmet's dates (5 dates with women in Izmir)
    INSERT INTO dates (id, user_id, country_code, city_id, gender, age_range, height_range, person_nickname, description, rating, face_rating, body_rating, chat_rating, date_at, created_at)
    VALUES
    ('00000000-0000-0000-0002-000000000021', '00000000-0000-0000-0000-000000000003', 'TR', (SELECT id FROM cities WHERE name='İzmir' LIMIT 1), 'female', '23-27', '165-170', 'Ceren', 'Alsancak kordon yuruyusu', 7, 8, 7, 6, (NOW() - INTERVAL '28 days')::date, NOW() - INTERVAL '28 days'),
    ('00000000-0000-0000-0002-000000000022', '00000000-0000-0000-0000-000000000003', 'TR', (SELECT id FROM cities WHERE name='İzmir' LIMIT 1), 'female', '28-32', '160-165', 'Pinar', 'Kemeralti''nda gezinti', 6, 6, 6, 7, (NOW() - INTERVAL '21 days')::date, NOW() - INTERVAL '21 days'),
    ('00000000-0000-0000-0002-000000000023', '00000000-0000-0000-0000-000000000003', 'TR', (SELECT id FROM cities WHERE name='İzmir' LIMIT 1), 'female', '23-27', '170-175', 'Ece', 'Cesme''de plaj gunu', 8, 9, 8, 7, (NOW() - INTERVAL '14 days')::date, NOW() - INTERVAL '14 days'),
    ('00000000-0000-0000-0002-000000000024', '00000000-0000-0000-0000-000000000003', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'female', '23-27', '165-170', 'Basak', 'Istanbul ziyaretinde bulustuk', 8, 7, 8, 8, (NOW() - INTERVAL '7 days')::date, NOW() - INTERVAL '7 days'),
    ('00000000-0000-0000-0002-000000000025', '00000000-0000-0000-0000-000000000003', 'TR', (SELECT id FROM cities WHERE name='İzmir' LIMIT 1), 'female', '18-22', '150-160', 'Yagmur', 'Kordon''da bisiklet surduk', 7, 8, 7, 6, (NOW() - INTERVAL '2 days')::date, NOW() - INTERVAL '2 days');

    -- sofia's dates (7 dates -- mixed genders, qualifies for LGBT badges)
    INSERT INTO dates (id, user_id, country_code, city_id, gender, age_range, height_range, person_nickname, description, rating, face_rating, body_rating, chat_rating, date_at, created_at)
    VALUES
    ('00000000-0000-0000-0002-000000000031', '00000000-0000-0000-0000-000000000004', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'male', '28-32', '180-185', 'Alp', 'Beyoglu''nda canli muzik', 8, 7, 8, 8, (NOW() - INTERVAL '45 days')::date, NOW() - INTERVAL '45 days'),
    ('00000000-0000-0000-0002-000000000032', '00000000-0000-0000-0000-000000000004', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'female', '23-27', '165-170', 'Nil', 'Karakoy''de brunch', 9, 9, 8, 9, (NOW() - INTERVAL '38 days')::date, NOW() - INTERVAL '38 days'),
    ('00000000-0000-0000-0002-000000000033', '00000000-0000-0000-0000-000000000004', 'DE', (SELECT id FROM cities WHERE name='Berlin' LIMIT 1), 'male', '23-27', '175-180', 'Max', 'Prenzlauer Berg cafe', 7, 7, 8, 6, (NOW() - INTERVAL '30 days')::date, NOW() - INTERVAL '30 days'),
    ('00000000-0000-0000-0002-000000000034', '00000000-0000-0000-0000-000000000004', 'TR', (SELECT id FROM cities WHERE name='Ankara' LIMIT 1), 'female', '28-32', '170-175', 'Defne', 'Kizilay gece hayati', 8, 8, 7, 8, (NOW() - INTERVAL '22 days')::date, NOW() - INTERVAL '22 days'),
    ('00000000-0000-0000-0002-000000000035', '00000000-0000-0000-0000-000000000004', 'GB', (SELECT id FROM cities WHERE name='London' LIMIT 1), 'male', '28-32', '185-190', 'James', 'Shoreditch dinner', 7, 6, 8, 7, (NOW() - INTERVAL '15 days')::date, NOW() - INTERVAL '15 days'),
    ('00000000-0000-0000-0002-000000000036', '00000000-0000-0000-0000-000000000004', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'other', '23-27', '170-175', 'Deniz', 'Kadikoy''de sanat galerisi', 8, 8, 7, 9, (NOW() - INTERVAL '8 days')::date, NOW() - INTERVAL '8 days'),
    ('00000000-0000-0000-0002-000000000037', '00000000-0000-0000-0000-000000000004', 'FR', (SELECT id FROM cities WHERE name='Paris' LIMIT 1), 'female', '23-27', '165-170', 'Camille', 'Montmartre yuruyusu', 9, 9, 9, 9, (NOW() - INTERVAL '3 days')::date, NOW() - INTERVAL '3 days');

    -- can's dates (2 dates -- new user)
    INSERT INTO dates (id, user_id, country_code, city_id, gender, age_range, height_range, person_nickname, description, rating, face_rating, body_rating, chat_rating, date_at, created_at)
    VALUES
    ('00000000-0000-0000-0002-000000000041', '00000000-0000-0000-0000-000000000005', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'female', '18-22', '160-165', 'Irem', 'Besiktas''ta bulustuk', 7, 7, 7, 6, (NOW() - INTERVAL '8 days')::date, NOW() - INTERVAL '8 days'),
    ('00000000-0000-0000-0002-000000000042', '00000000-0000-0000-0000-000000000005', 'TR', (SELECT id FROM cities WHERE name='İstanbul' LIMIT 1), 'female', '23-27', '165-170', 'Beren', 'Taksim''de sinema gecesi', 8, 8, 7, 8, (NOW() - INTERVAL '3 days')::date, NOW() - INTERVAL '3 days');

    -- ============================================
    -- DATE TAGS
    -- Tag IDs: meeting(1-10), venue(11-25), activity(26-45)
    -- ============================================
    INSERT INTO date_tags (date_id, tag_id) VALUES
    -- ahmet's date with Elif: Dating App, Restaurant, Dinner
    ('00000000-0000-0000-0002-000000000001', 1), ('00000000-0000-0000-0002-000000000001', 11), ('00000000-0000-0000-0002-000000000001', 26),
    -- ahmet's date with Zeynep: Social Media, Park, Walk
    ('00000000-0000-0000-0002-000000000002', 5), ('00000000-0000-0000-0002-000000000002', 15), ('00000000-0000-0000-0002-000000000002', 30),
    -- ahmet's date with Selin: Through Friends, Cafe, Coffee
    ('00000000-0000-0000-0002-000000000003', 3), ('00000000-0000-0000-0002-000000000003', 12), ('00000000-0000-0000-0002-000000000003', 28),
    -- ahmet's date with Deniz: Dating App, Restaurant, Dinner, Sex
    ('00000000-0000-0000-0002-000000000004', 1), ('00000000-0000-0000-0002-000000000004', 11), ('00000000-0000-0000-0002-000000000004', 26), ('00000000-0000-0000-0002-000000000004', 32),
    -- ahmet's London date: Dating App, Bar, Drinks
    ('00000000-0000-0000-0002-000000000005', 1), ('00000000-0000-0000-0002-000000000005', 13), ('00000000-0000-0000-0002-000000000005', 27),
    -- ayse's dates tags
    ('00000000-0000-0000-0002-000000000011', 3), ('00000000-0000-0000-0002-000000000011', 12), ('00000000-0000-0000-0002-000000000011', 28),
    ('00000000-0000-0000-0002-000000000014', 1), ('00000000-0000-0000-0002-000000000014', 13), ('00000000-0000-0000-0002-000000000014', 27), ('00000000-0000-0000-0002-000000000014', 31),
    ('00000000-0000-0000-0002-000000000015', 1), ('00000000-0000-0000-0002-000000000015', 11), ('00000000-0000-0000-0002-000000000015', 26);

    -- ============================================
    -- PRIVACY SETTINGS (defaults for each user)
    -- ============================================
    INSERT INTO privacy_settings (user_id, share_countries, share_cities, share_dates, share_stats)
    VALUES
    ('00000000-0000-0000-0000-000000000001', TRUE, TRUE, TRUE, TRUE),
    ('00000000-0000-0000-0000-000000000002', TRUE, TRUE, TRUE, TRUE),
    ('00000000-0000-0000-0000-000000000003', TRUE, TRUE, FALSE, TRUE),
    ('00000000-0000-0000-0000-000000000004', TRUE, TRUE, TRUE, TRUE);

    -- ============================================
    -- USER STREAKS
    -- ============================================
    INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_log_week)
    VALUES
    ('00000000-0000-0000-0000-000000000001', 5, 8, EXTRACT(YEAR FROM NOW())::int * 100 + EXTRACT(WEEK FROM NOW())::int),
    ('00000000-0000-0000-0000-000000000002', 3, 5, EXTRACT(YEAR FROM NOW())::int * 100 + EXTRACT(WEEK FROM NOW())::int),
    ('00000000-0000-0000-0000-000000000003', 2, 4, EXTRACT(YEAR FROM NOW())::int * 100 + EXTRACT(WEEK FROM NOW())::int),
    ('00000000-0000-0000-0000-000000000004', 4, 6, EXTRACT(YEAR FROM NOW())::int * 100 + EXTRACT(WEEK FROM NOW())::int),
    ('00000000-0000-0000-0000-000000000005', 1, 1, EXTRACT(YEAR FROM NOW())::int * 100 + EXTRACT(WEEK FROM NOW())::int);

    -- ============================================
    -- BADGES (award based on data)
    -- ahmet: 8 female dates -> Centilmen(1), Playboy(2), 3 countries -> Gezgin(14)
    -- ayse: 6 male dates -> Ilk Bulusma(6), Heartbreaker(7)
    -- mehmet: 5 female dates -> Centilmen(1), Playboy(2)
    -- sofia: mixed genders -> Merakli(11), 3 countries -> Gezgin(14)
    -- can: 2 female dates -> Centilmen(1)
    -- ============================================
    INSERT INTO user_badges (user_id, badge_id, earned_at) VALUES
    ('00000000-0000-0000-0000-000000000001', 1, NOW() - INTERVAL '55 days'),
    ('00000000-0000-0000-0000-000000000001', 2, NOW() - INTERVAL '30 days'),
    ('00000000-0000-0000-0000-000000000001', 14, NOW() - INTERVAL '20 days'),
    ('00000000-0000-0000-0000-000000000002', 6, NOW() - INTERVAL '42 days'),
    ('00000000-0000-0000-0000-000000000002', 7, NOW() - INTERVAL '18 days'),
    ('00000000-0000-0000-0000-000000000003', 1, NOW() - INTERVAL '28 days'),
    ('00000000-0000-0000-0000-000000000003', 2, NOW() - INTERVAL '7 days'),
    ('00000000-0000-0000-0000-000000000004', 11, NOW() - INTERVAL '38 days'),
    ('00000000-0000-0000-0000-000000000004', 14, NOW() - INTERVAL '30 days'),
    ('00000000-0000-0000-0000-000000000005', 1, NOW() - INTERVAL '8 days');

    -- ============================================
    -- FORUM TOPICS
    -- ============================================
    INSERT INTO forum_topics (id, user_id, title, body, category, is_anonymous, like_count, comment_count, created_at)
    VALUES
    ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 'Istanbul''da en iyi date mekanlari?', 'Beyoglu, Karakoy, Kadikoy taraflarinda onerileriniz neler? Ozellikle ilk bulusma icin uygun yerler ariyorum.', 'questions', FALSE, 3, 2, NOW() - INTERVAL '20 days'),
    ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000002', 'Ilk bulusmada ne giyilir?', 'Casual mi sik mi? Mekanina gore mi degisir? Erkekler ne tercih ediyor sizce?', 'tips', FALSE, 5, 3, NOW() - INTERVAL '15 days'),
    ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-000000000004', 'Berlin vs Istanbul date kulturu', 'Iki sehirde de date''e ciktim ve kulturel farklar inanilmaz. Berlin''de insanlar cok daha direkt. Istanbul''da ise her sey daha romantik ama belirsiz.', 'stories', FALSE, 7, 1, NOW() - INTERVAL '10 days'),
    ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000003', 'Uzun mesafe iliskiler', 'Farkli sehirlerde tanistiginiz biriyle devam ettiniz mi hic? Nasil yuruyor?', 'general', FALSE, 2, 0, NOW() - INTERVAL '5 days'),
    ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000005', 'Anonim itiraf', 'Ilk date''imde yanlislikla garsonun ustune su doktum. Utanctan yerin dibine girdim ama kiz cok guldu ve ikinci date''e evet dedi', 'stories', TRUE, 12, 4, NOW() - INTERVAL '3 days');

    -- ============================================
    -- FORUM COMMENTS
    -- ============================================
    INSERT INTO forum_comments (id, topic_id, user_id, parent_id, body, depth, like_count, created_at)
    VALUES
    -- Comments on topic 1 (Istanbul mekanlari)
    ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000002', NULL, 'Karakoy''deki Kronotrop kesinlikle. Hem kahve harika hem de sohbet ortami cok iyi.', 0, 2, NOW() - INTERVAL '19 days'),
    ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0004-000000000001', 'Katiliyorum! Bir de Kadikoy Moda sahili yuruyus icin mukemmel.', 1, 1, NOW() - INTERVAL '18 days'),
    -- Comments on topic 2 (Ne giyilir)
    ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000001', NULL, 'Mekanina gore degisir ama genel kural: biraz overdressed olmak underdressed olmaktan iyidir.', 0, 3, NOW() - INTERVAL '14 days'),
    ('00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000003', NULL, 'Smart casual her zaman guvenli secim. Temiz ayakkabi cok onemli!', 0, 2, NOW() - INTERVAL '13 days'),
    ('00000000-0000-0000-0004-000000000005', '00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0004-000000000003', 'Kesinlikle katiliyorum. Parfum de unutulmamali ama abartmadan.', 1, 1, NOW() - INTERVAL '12 days'),
    -- Comments on topic 3 (Berlin vs Istanbul)
    ('00000000-0000-0000-0004-000000000006', '00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-000000000001', NULL, 'Cok dogru! Londra da farkli bir dunya bu konuda.', 0, 1, NOW() - INTERVAL '9 days'),
    -- Comments on topic 5 (Anonim itiraf)
    ('00000000-0000-0000-0004-000000000007', '00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000001', NULL, 'Hahahaha klasik! En azindan icebreaker olmus', 0, 4, NOW() - INTERVAL '2 days'),
    ('00000000-0000-0000-0004-000000000008', '00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000002', NULL, 'Cok tatli! Ikinci date nasil gecti?', 0, 2, NOW() - INTERVAL '2 days'),
    ('00000000-0000-0000-0004-000000000009', '00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0004-000000000007', 'Bence samimiyet her zaman kazandirir', 1, 1, NOW() - INTERVAL '1 day'),
    ('00000000-0000-0000-0004-000000000010', '00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0004-000000000008', 'Evet merak ettim ben de!', 1, 0, NOW() - INTERVAL '1 day');

    -- ============================================
    -- FORUM LIKES
    -- ============================================
    INSERT INTO forum_likes (user_id, target_type, target_id, created_at) VALUES
    ('00000000-0000-0000-0000-000000000002', 'topic', '00000000-0000-0000-0003-000000000001', NOW() - INTERVAL '19 days'),
    ('00000000-0000-0000-0000-000000000004', 'topic', '00000000-0000-0000-0003-000000000001', NOW() - INTERVAL '18 days'),
    ('00000000-0000-0000-0000-000000000003', 'topic', '00000000-0000-0000-0003-000000000001', NOW() - INTERVAL '17 days'),
    ('00000000-0000-0000-0000-000000000001', 'topic', '00000000-0000-0000-0003-000000000005', NOW() - INTERVAL '2 days'),
    ('00000000-0000-0000-0000-000000000002', 'topic', '00000000-0000-0000-0003-000000000005', NOW() - INTERVAL '2 days'),
    ('00000000-0000-0000-0000-000000000003', 'topic', '00000000-0000-0000-0003-000000000005', NOW() - INTERVAL '2 days'),
    ('00000000-0000-0000-0000-000000000004', 'topic', '00000000-0000-0000-0003-000000000005', NOW() - INTERVAL '1 day');

    -- ============================================
    -- NOTIFICATIONS
    -- ============================================
    INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at) VALUES
    (NULL, 'Hos geldiniz!', 'havesmashed''a hos geldiniz. Date''lerinizi kaydetmeye baslayin!', 'system', FALSE, NOW() - INTERVAL '60 days'),
    ('00000000-0000-0000-0000-000000000001', 'ayse yeni bir date girdi!', 'Istanbul - ' || to_char(NOW() - INTERVAL '42 days', 'YYYY-MM-DD'), 'friend_date', TRUE, NOW() - INTERVAL '42 days'),
    ('00000000-0000-0000-0000-000000000001', 'Yeni rozet kazandin!', 'Playboy rozetini kazandin!', 'badge', TRUE, NOW() - INTERVAL '30 days');

    RAISE NOTICE 'Seed data inserted successfully!';
END $$;
