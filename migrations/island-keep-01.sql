-- Сохранённые карты (владелец, 04.11.2026: остров Ангелины «с реальными
-- редакциями — сохранить, не удалять ни в коем случае»). Применять ДО кода.
--  · raid_map_keep — карты, которые нельзя удалить: DELETE из raid_maps
--    отказывает исключением map.kept (любая дорога: «Новый остров», портал,
--    «Обучение с нуля», ручной запрос). Снять защиту — удалить строку отсюда.
--  · raid_map_snapshot — снимки карты (строка карты, острова и все клетки) для
--    восстановления.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_map_keep (
  map_id     text PRIMARY KEY,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.raid_map_snapshot (
  id       bigserial PRIMARY KEY,
  map_id   text        NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  map      jsonb,
  island   jsonb,
  cells    jsonb       NOT NULL
);
CREATE INDEX IF NOT EXISTS raid_map_snapshot_map ON yuplink.raid_map_snapshot (map_id, taken_at DESC);

CREATE OR REPLACE FUNCTION yuplink.raid_maps_keep_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM yuplink.raid_map_keep k WHERE k.map_id = OLD.id) THEN
    RAISE EXCEPTION 'map.kept' USING DETAIL = OLD.id;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS raid_maps_keep_guard ON yuplink.raid_maps;
CREATE TRIGGER raid_maps_keep_guard BEFORE DELETE ON yuplink.raid_maps
  FOR EACH ROW EXECUTE FUNCTION yuplink.raid_maps_keep_guard();

COMMIT;
