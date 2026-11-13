-- Клад, закопанный админом вручную (владелец 07.11.2026: «админ может сам запустить, если что —
-- живёт сутки»): manual = true, живёт сутки от запуска. Слот дня — один только у автоматических;
-- ручной в слоте может быть рядом с ним.
SET lock_timeout = '5s';

ALTER TABLE yuplink.raid_treasure ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false;
ALTER TABLE yuplink.raid_treasure DROP CONSTRAINT IF EXISTS raid_treasure_slot_key;
CREATE UNIQUE INDEX IF NOT EXISTS raid_treasure_slot_auto ON yuplink.raid_treasure (slot) WHERE NOT manual;
