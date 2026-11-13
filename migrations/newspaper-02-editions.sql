DO $newspaper_editions$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'yuplink' AND table_name = 'newspaper_issue'
       AND column_name = 'editions'
  ) THEN
    PERFORM set_config('lock_timeout', '3s', true);
    ALTER TABLE yuplink.newspaper_issue ADD COLUMN IF NOT EXISTS editions jsonb;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'yuplink' AND table_name = 'newspaper_issue'
       AND column_name = 'editions' AND data_type = 'jsonb' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'newspaper editions schema mismatch';
  END IF;
END;
$newspaper_editions$;
