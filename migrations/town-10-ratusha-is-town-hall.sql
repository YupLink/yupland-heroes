-- «Ратуша» на карте — это ратуша (владелец, 05.10.2026: «режим бога не позволяет
-- редачить ратушу — сделай наконец-то, чтобы админ мог редачить и настраивать»).
--
-- 31 здание «Ратуша» стояло из двух шаблонов без поведения: картинка, а не
-- ратуша, — в окне клетки не было «Настроек города». Шаблонам ставим поведение
-- town_hall (клетке своё поведение по-прежнему можно назначить в окне клетки),
-- а каждую ратушу карты заносим в реестр: по нему лавки выбирают, к какой
-- ратуше привязаться. Идемпотентно.
BEGIN;

UPDATE yuplink.mystic_item_template
   SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{effect}', '"town_hall"')
 WHERE kind = 'building' AND name = 'Ратуша' AND COALESCE(meta->>'effect', '') = '';

INSERT INTO yuplink.raid_town (map_id, q, r, config, created_at, updated_at)
SELECT c.map_id, c.q, c.r, '{}'::jsonb, now(), now()
  FROM yuplink.raid_map_cells c
  JOIN yuplink.mystic_item_template t ON t.id = c.building_id
 WHERE COALESCE(c.building_config->>'effect', t.meta->>'effect') = 'town_hall'
ON CONFLICT (map_id, q, r) DO NOTHING;

COMMIT;
