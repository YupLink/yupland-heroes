-- Этажи и комнаты порталов (владелец, 07.10.2026: «новый этаж = новая карта,
-- можно задавать название — например, мир лабиринта»; комнаты — «m.1–m.n»,
-- где m — этаж). Накатывать ДО кода.
--
-- raid_floor — карты, открытые для переходов, с номером и названием. Первый
-- этаж — главный мир (settings.beta_raid_map). Этаж открыт = карта active:
-- на закрытую карту портал не пускает.
--
-- raid_portal_room — имена и преднастройки комнат по этажам. Комната — номер
-- сети в настройке портала (building_config.portal.group) на этаже
-- portal.targetMap (пусто — на своём). Раньше имена были одним словарём на всю
-- игру (settings.portal_group_names): переносим каждое имя в комнату того
-- этажа, где стоят порталы с этим номером, а неиспользованные — в главный мир.
-- Сам словарь не трогаем: код его больше не читает.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_floor (
  map_id     text PRIMARY KEY REFERENCES yuplink.raid_maps(id) ON DELETE CASCADE,
  num        int NOT NULL UNIQUE CHECK (num > 0),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

CREATE TABLE IF NOT EXISTS yuplink.raid_portal_room (
  map_id     text NOT NULL REFERENCES yuplink.raid_maps(id) ON DELETE CASCADE,
  num        int NOT NULL CHECK (num BETWEEN 1 AND 999),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  tpl        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, num)
);

-- Первый этаж — главный мир под своим именем.
INSERT INTO yuplink.raid_floor (map_id, num, name)
SELECT m.id, 1, left(btrim(m.name), 40)
  FROM yuplink.settings s
  JOIN yuplink.raid_maps m ON m.id = (s.value::jsonb)->>'mapId'
 WHERE s.key = 'beta_raid_map'
ON CONFLICT DO NOTHING;

UPDATE yuplink.raid_maps SET active = true
 WHERE id IN (SELECT map_id FROM yuplink.raid_floor) AND NOT active;

WITH main AS (
  SELECT (value::jsonb)->>'mapId' AS id FROM yuplink.settings WHERE key = 'beta_raid_map'
), dict AS (
  SELECT k::int AS num,
         left(btrim(CASE jsonb_typeof(v) WHEN 'string' THEN v #>> '{}' ELSE v->>'name' END), 40) AS name,
         CASE jsonb_typeof(v) WHEN 'object' THEN v - 'name' ELSE '{}'::jsonb END AS tpl
    FROM yuplink.settings s, jsonb_each(s.value::jsonb) AS e(k, v)
   WHERE s.key = 'portal_group_names' AND k ~ '^[0-9]{1,3}$' AND k::int > 0
), used AS (
  SELECT DISTINCT
         COALESCE(NULLIF(btrim(c.building_config->'portal'->>'targetMap'), ''), c.map_id) AS map_id,
         (c.building_config->'portal'->>'group')::int AS num
    FROM yuplink.raid_map_cells c
   WHERE c.building_config ? 'portal'
     AND (c.building_config->'portal'->>'group') ~ '^[0-9]{1,3}$'
)
INSERT INTO yuplink.raid_portal_room (map_id, num, name, tpl)
SELECT COALESCE(u.map_id, (SELECT id FROM main)), d.num, d.name, d.tpl
  FROM dict d
  LEFT JOIN used u ON u.num = d.num
 WHERE coalesce(d.name, '') <> ''
   AND COALESCE(u.map_id, (SELECT id FROM main)) IN (SELECT id FROM yuplink.raid_maps)
ON CONFLICT (map_id, num) DO NOTHING;

COMMIT;
