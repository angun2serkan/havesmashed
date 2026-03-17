ALTER TABLE badges ADD COLUMN tier VARCHAR(10) DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold'));

-- Set tiers based on threshold progression within each gender group
-- Male badges: 1=bronze, 5=bronze, 15=silver, 30=gold, 50=gold
UPDATE badges SET tier = 'bronze' WHERE id IN (1, 2, 6, 7);
UPDATE badges SET tier = 'silver' WHERE id IN (3, 8, 12);
UPDATE badges SET tier = 'gold' WHERE id IN (4, 5, 9, 10, 13);

-- Explore: low threshold=bronze, mid=silver, high=gold
UPDATE badges SET tier = 'bronze' WHERE id = 14;  -- 3 countries
UPDATE badges SET tier = 'silver' WHERE id IN (15, 16);  -- 10 countries, 5 cities
UPDATE badges SET tier = 'gold' WHERE id = 17;  -- 15 cities

-- Quality & Social
UPDATE badges SET tier = 'gold' WHERE id = 18;  -- avg 8+ rating
UPDATE badges SET tier = 'silver' WHERE id = 19;  -- 5 friends
