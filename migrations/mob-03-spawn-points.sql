-- Точки спавна мобов (владелец, 04.11.2026 по голосу Ярослава: «поставил точку, в
-- этой точке выбрал мобов, погоду, когда эти мобы спавнятся, частоту и фонд на
-- моба»; «погода спавна — выбирать несколько»).
--
-- 1. Погода возрождения — СПИСКОМ (weathers): моб встаёт, если в мире любая из
--    отмеченных. Старая колонка weather остаётся (код читает её, пока weathers
--    пуст) — её значения переносятся в список здесь же.
-- 2. point_id у записи возрождения: её завела и ведёт точка спавна.
-- 3. raid_spawn_point — сама точка: клетка, радиус и строки мобов (моб, сколько,
--    погода, через сколько встаёт, своя награда или как у моба).
--
-- Накатывать ДО кода. Повтор безопасен (IF NOT EXISTS, перенос — только пустым).
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_mob_spawn ADD COLUMN IF NOT EXISTS weathers text[];
ALTER TABLE yuplink.raid_mob_spawn ADD COLUMN IF NOT EXISTS point_id text;
DO $$ BEGIN
  ALTER TABLE yuplink.raid_mob_spawn ADD CONSTRAINT raid_mob_spawn_weathers_check CHECK (
    weathers IS NULL OR weathers <@ ARRAY['clear', 'overcast', 'rain', 'fog', 'storm',
      'thunderstorm', 'blizzard', 'frost', 'heat']::text[]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
UPDATE yuplink.raid_mob_spawn
   SET weathers = ARRAY[weather]
 WHERE weather IS NOT NULL AND weathers IS NULL;
CREATE INDEX IF NOT EXISTS raid_mob_spawn_point ON yuplink.raid_mob_spawn (point_id)
  WHERE point_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS yuplink.raid_spawn_point (
  id         text        PRIMARY KEY,
  map_id     text        NOT NULL,
  q          integer     NOT NULL,
  r          integer     NOT NULL,
  radius     integer     NOT NULL CHECK (radius BETWEEN 0 AND 10),
  mobs       jsonb       NOT NULL CHECK (jsonb_typeof(mobs) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, q, r)
);
ALTER TABLE yuplink.raid_spawn_point OWNER TO postgres;

COMMIT;
