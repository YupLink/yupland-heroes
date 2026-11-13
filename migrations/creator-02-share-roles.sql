-- Креатор: общий доступ с ролью (владелец, 07.11.2026: «поделиться — выбираешь роль
-- для другого человека — только просмотр или редакция; если редакция — мир меняется
-- у обоих; только просмотр — можно только смотреть, но можно сделать копию»).
-- Прежние строки — редакция (так они и работали). Применять ДО кода.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE yuplink.raid_creator_share
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'edit';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raid_creator_share_role_chk') THEN
    ALTER TABLE yuplink.raid_creator_share
      ADD CONSTRAINT raid_creator_share_role_chk CHECK (role IN ('view', 'edit'));
  END IF;
END $$;
COMMIT;
