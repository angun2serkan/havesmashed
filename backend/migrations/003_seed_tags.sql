-- ============================================================
-- haveismashedV2 — Seed Tags by Category
-- ============================================================

-- ============================================================
-- MEETING TAGS — How you met the person
-- ============================================================
INSERT INTO tags (name, category, is_predefined) VALUES
    ('Dating App', 'meeting', TRUE),
    ('Bar/Club', 'meeting', TRUE),
    ('Through Friends', 'meeting', TRUE),
    ('Work/School', 'meeting', TRUE),
    ('Social Media', 'meeting', TRUE),
    ('Public Place', 'meeting', TRUE),
    ('Event/Party', 'meeting', TRUE),
    ('Gym/Sports', 'meeting', TRUE),
    ('Online Other', 'meeting', TRUE),
    ('Blind Date', 'meeting', TRUE);

-- ============================================================
-- VENUE TAGS — Where the date took place
-- ============================================================
INSERT INTO tags (name, category, is_predefined) VALUES
    ('Restaurant', 'venue', TRUE),
    ('Cafe', 'venue', TRUE),
    ('Bar', 'venue', TRUE),
    ('Club/Nightclub', 'venue', TRUE),
    ('Park', 'venue', TRUE),
    ('Beach', 'venue', TRUE),
    ('Cinema', 'venue', TRUE),
    ('Museum/Gallery', 'venue', TRUE),
    ('Shopping Mall', 'venue', TRUE),
    ('Home', 'venue', TRUE),
    ('Hotel', 'venue', TRUE),
    ('Rooftop', 'venue', TRUE),
    ('Concert/Event', 'venue', TRUE),
    ('Spa/Wellness', 'venue', TRUE),
    ('Amusement Park', 'venue', TRUE);

-- ============================================================
-- ACTIVITY TAGS — What you did on the date
-- ============================================================
INSERT INTO tags (name, category, is_predefined) VALUES
    ('Dinner', 'activity', TRUE),
    ('Drinks', 'activity', TRUE),
    ('Coffee', 'activity', TRUE),
    ('Movie', 'activity', TRUE),
    ('Walk/Stroll', 'activity', TRUE),
    ('Dancing', 'activity', TRUE),
    ('Sex', 'activity', TRUE),
    ('Cooking Together', 'activity', TRUE),
    ('Sports/Fitness', 'activity', TRUE),
    ('Shopping', 'activity', TRUE),
    ('Travel', 'activity', TRUE),
    ('Sightseeing', 'activity', TRUE),
    ('Concert/Show', 'activity', TRUE),
    ('Gaming', 'activity', TRUE),
    ('Picnic', 'activity', TRUE),
    ('Swimming', 'activity', TRUE),
    ('Hiking/Trekking', 'activity', TRUE),
    ('Karaoke', 'activity', TRUE),
    ('Board Games', 'activity', TRUE),
    ('Hookah/Shisha', 'activity', TRUE);

-- ============================================================
-- PHYSICAL TAGS (FEMALE) — Physical attributes for female dates
-- ============================================================
INSERT INTO tags (name, category, is_predefined) VALUES
    -- Hair
    ('Blonde', 'physical_female', TRUE),
    ('Brunette', 'physical_female', TRUE),
    ('Redhead', 'physical_female', TRUE),
    ('Black Hair', 'physical_female', TRUE),
    ('Colored Hair', 'physical_female', TRUE),
    -- Height
    ('Short', 'physical_female', TRUE),
    ('Average Height', 'physical_female', TRUE),
    ('Tall', 'physical_female', TRUE),
    -- Body
    ('Slim', 'physical_female', TRUE),
    ('Fit/Athletic', 'physical_female', TRUE),
    ('Curvy', 'physical_female', TRUE),
    ('Plus Size', 'physical_female', TRUE),
    -- Style
    ('Tattoos', 'physical_female', TRUE),
    ('Piercings', 'physical_female', TRUE),
    ('Glasses', 'physical_female', TRUE),
    ('Hijab', 'physical_female', TRUE);

-- ============================================================
-- PHYSICAL TAGS (MALE) — Physical attributes for male dates
-- ============================================================
INSERT INTO tags (name, category, is_predefined) VALUES
    -- Hair
    ('Blonde', 'physical_male', TRUE),
    ('Brunette', 'physical_male', TRUE),
    ('Redhead', 'physical_male', TRUE),
    ('Black Hair', 'physical_male', TRUE),
    ('Bald', 'physical_male', TRUE),
    -- Height
    ('Short', 'physical_male', TRUE),
    ('Average Height', 'physical_male', TRUE),
    ('Tall', 'physical_male', TRUE),
    -- Body
    ('Slim', 'physical_male', TRUE),
    ('Athletic', 'physical_male', TRUE),
    ('Muscular', 'physical_male', TRUE),
    ('Dad Bod', 'physical_male', TRUE),
    ('Plus Size', 'physical_male', TRUE),
    -- Facial Hair
    ('Beard', 'physical_male', TRUE),
    ('Mustache', 'physical_male', TRUE),
    ('Clean Shaven', 'physical_male', TRUE),
    ('Stubble', 'physical_male', TRUE),
    -- Style
    ('Tattoos', 'physical_male', TRUE),
    ('Piercings', 'physical_male', TRUE),
    ('Glasses', 'physical_male', TRUE);
