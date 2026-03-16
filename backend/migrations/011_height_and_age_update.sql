-- Add height_range column to dates
ALTER TABLE dates ADD COLUMN height_range VARCHAR(10)
    CHECK (height_range IN ('-150', '150-160', '160-165', '165-170', '170-175', '175-180', '180-185', '185-190', '190-195', '195-200', '200+'));

-- Update age_range CHECK constraint: remove '43-47' and '48+', add '43+'
ALTER TABLE dates DROP CONSTRAINT IF EXISTS dates_age_range_check;
ALTER TABLE dates ADD CONSTRAINT dates_age_range_check
    CHECK (age_range IN ('18-22', '23-27', '28-32', '33-37', '38-42', '43+'));

-- Update existing records that have old age ranges
UPDATE dates SET age_range = '43+' WHERE age_range IN ('43-47', '48+');
