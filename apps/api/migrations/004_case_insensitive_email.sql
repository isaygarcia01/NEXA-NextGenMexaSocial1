ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users
  ALTER COLUMN email TYPE VARCHAR(320) USING email::text;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

ALTER TABLE email_outbox
  ALTER COLUMN recipient TYPE VARCHAR(320) USING recipient::text;
