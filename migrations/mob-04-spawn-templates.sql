-- Шаблоны точек спавна (владелец, 06.11.2026: «точки спавна как-то настроить и
-- потом просто натыкивать, где они нужны … сейчас каждую ручку надо вбивать»).
-- Шаблон — то же, что точка (lib/raid/spawnPoint): радиус и строки мобов, но
-- без клетки и общий на все карты. Тап шаблоном по клетке = точка спавна.
--
-- Накатывать ДО кода. Повтор безопасен (IF NOT EXISTS).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_spawn_template (
  id         text        PRIMARY KEY,
  name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  radius     integer     NOT NULL CHECK (radius BETWEEN 0 AND 10),
  mobs       jsonb       NOT NULL CHECK (jsonb_typeof(mobs) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE yuplink.raid_spawn_template OWNER TO postgres;

COMMIT;
