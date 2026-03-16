ALTER TABLE notifications ADD COLUMN notification_type VARCHAR(20) NOT NULL DEFAULT 'system';
-- Types: 'system', 'friend_date', 'badge'
