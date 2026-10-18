-- Миры по чанкам (владелец, 06.10.2026: «генерировать большие территории
-- автоматически … миры бесконечной генерации на основании чанков»). Накатывать
-- ДО кода: генератор пишет мир и его чанки сюда.
--
-- raid_world — мир при карте: сид и спецификация, снятая с образца в момент
-- создания (доли, земли, декор, объекты, шаблоны ратуш). Новые чанки считаются
-- по ней же, а не по сегодняшнему образцу — иначе стык разошёлся бы.
-- raid_world_chunk — какие чанки уже на карте: дорастить мир = посчитать
-- соседние, которых тут ещё нет. Карта удалена — мир и чанки уходят с ней.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- endless: true — мир без края (растёт чанками, начало в центре рамки 512);
-- false — карта в рамке size × size, посчитанная целиком.
CREATE TABLE IF NOT EXISTS yuplink.raid_world (
  map_id     text PRIMARY KEY REFERENCES yuplink.raid_maps(id) ON DELETE CASCADE,
  seed       bigint NOT NULL,
  endless    boolean NOT NULL DEFAULT false,
  spec       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

CREATE TABLE IF NOT EXISTS yuplink.raid_world_chunk (
  map_id     text NOT NULL REFERENCES yuplink.raid_world(map_id) ON DELETE CASCADE,
  cx         int NOT NULL,
  cy         int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, cx, cy)
);

COMMIT;
