-- Точки возрождения мобов (владелец, 15.10.2026): админ ставит моба на клетку и
-- включает «Возрождение» — убитый встаёт на той же клетке через N минут, живой
-- бродит вокруг неё на несколько клеток. Правила — mob-spawn.ts.
CREATE TABLE IF NOT EXISTS yuplink.raid_mob_spawn (
  id            text PRIMARY KEY,
  map_id        text NOT NULL,
  -- родная клетка: здесь моб встаёт и вокруг неё бродит
  home_q        integer NOT NULL,
  home_r        integer NOT NULL,
  -- какой моб: id и настройки объекта клетки на момент включения
  object_id     text NOT NULL,
  object_config jsonb,
  respawn_min   integer NOT NULL CHECK (respawn_min BETWEEN 1 AND 10080),
  roam          integer NOT NULL DEFAULT 0 CHECK (roam BETWEEN 0 AND 10),
  step_min      integer NOT NULL DEFAULT 5 CHECK (step_min BETWEEN 1 AND 1440),
  -- где моб сейчас; NULL — убит и ждёт возрождения (dead_at)
  cur_q         integer,
  cur_r         integer,
  dead_at       timestamptz,
  next_step_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, home_q, home_r)
);
CREATE INDEX IF NOT EXISTS raid_mob_spawn_map ON yuplink.raid_mob_spawn (map_id);
