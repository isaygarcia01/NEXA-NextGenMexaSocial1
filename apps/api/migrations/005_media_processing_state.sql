ALTER TABLE media DROP CONSTRAINT IF EXISTS media_processing_status_check;
ALTER TABLE media
  ADD CONSTRAINT media_processing_status_check
  CHECK (processing_status IN ('pending', 'processing', 'ready', 'rejected', 'failed'));
