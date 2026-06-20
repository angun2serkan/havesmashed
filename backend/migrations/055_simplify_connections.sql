-- Friend request onay akışı kaldırıldı: tek kullanımlık kod modeli.
-- POST /api/connections/add artık satırı direkt status='accepted' ile insert ediyor.
-- pending/rejected değerleri kalıcı olarak kapatılır.

DELETE FROM connections WHERE status IN ('pending', 'rejected');

ALTER TABLE connections ALTER COLUMN status SET DEFAULT 'accepted';

ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_status_check;
ALTER TABLE connections ADD CONSTRAINT connections_status_check CHECK (status = 'accepted');
