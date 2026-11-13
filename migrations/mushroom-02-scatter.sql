-- Раскидка грибов DARAI по «Миру Альфа» (владелец, 22.10.2026: «раскидай по
-- карте … грибов с дараями»; число — 10, поправка владельца того же дня).
-- ПОСЛЕ mushroom-01 (облик bskin_dm_mushroom, жизнь diesAt, обход конца жизни).
--
-- Гриб без хозяина: строки raid_mine_state нет — из пула ничего не списывается,
-- жизнь (7 суток от раскидки) идёт. Поднимает любой за 5 энергии.
--
-- Клетка — годная для постановки шахт (§8.59 п. 8) и с запасом: суша (не вода,
-- не океан), не под глухим туманом, не дорога, без постройки, блока, объекта,
-- декора, беглеца, сундука, судна, мешочка, жилы, охраны, следа шахты, тира
-- постройки, чертежа, игрока, ямки от лопаты и без дерева/горы, которые ещё вырастут. Все
-- шесть соседей проходимы (суша, не туман, без постройки, блока, стены-декора и
-- будущего дерева) — гриб-стена тогда не перекроет проход: соседи связаны
-- кольцом в обход него. Грибы не вплотную друг к другу (шаг ≥ 2).
-- Порядок кандидатов — md5 от клетки с солью партии: проба с откатом и
-- применение выбирают одни и те же клетки.
--
-- Ключ партии — settings 'mushroom_scatter:20261022': повтор файла ничего не
-- добавляет. В value — когда и какие клетки. После — «карта перестроена» у всех.
BEGIN;
SET lock_timeout = '5s';

DO $do$
DECLARE
  v_map  text := 'rmap_UthOURxc';
  v_need integer := 10;
  v_dies timestamptz := now() + interval '7 days';
  v_n    integer := 0;
  v_rev  bigint;
  v_cells jsonb;
  c      record;
BEGIN
  INSERT INTO yuplink.settings (key, value)
  VALUES ('mushroom_scatter:20261022', '{"state":"started"}')
  ON CONFLICT (key) DO NOTHING;
  IF NOT FOUND THEN
    RAISE NOTICE 'грибы этой партии уже раскиданы — ничего не делаю';
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('godmove:' || v_map));

  CREATE TEMP TABLE mush_pick (q integer, r integer) ON COMMIT DROP;
  FOR c IN
    SELECT x.q, x.r
      FROM yuplink.raid_map_cells x
      JOIN yuplink.mystic_item_template t ON t.id = x.terrain_id
     WHERE x.map_id = v_map
       AND NOT (t.name ~* '(вод|water|море|океан|ocean|river|река)')
       AND NOT COALESCE(x.void_fog, false)
       AND NULLIF(btrim(COALESCE(x.road_id, '')), '') IS NULL
       AND x.building_id IS NULL AND x.group_id IS NULL
       AND x.object_id IS NULL AND x.decoration_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_runner o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_map_vein o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_state o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_building_state o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_plan o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_decor_respawn o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_dig_hole o
                        WHERE o.map_id = x.map_id AND o.q = x.q AND o.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions o
                        WHERE o.q = x.q AND o.r = x.r
                          AND COALESCE(o.map_id, (SELECT (s.value::jsonb)->>'mapId'
                                                    FROM yuplink.settings s
                                                   WHERE s.key = 'beta_raid_map')) = x.map_id)
       -- Все шесть соседей проходимы: гриб не перекроет проход.
       AND (SELECT count(*)
              FROM yuplink.raid_map_cells n
              JOIN yuplink.mystic_item_template nt ON nt.id = n.terrain_id
             WHERE n.map_id = x.map_id
               AND (n.q, n.r) IN ((x.q + 1, x.r), (x.q + 1, x.r - 1), (x.q, x.r - 1),
                                  (x.q - 1, x.r), (x.q - 1, x.r + 1), (x.q, x.r + 1))
               AND NOT (nt.name ~* '(вод|water|море|океан|ocean|river|река)')
               AND NOT COALESCE(n.void_fog, false)
               AND n.building_id IS NULL AND n.group_id IS NULL
               AND NOT (n.decoration_id IS NOT NULL AND EXISTS (
                     SELECT 1 FROM yuplink.mystic_item_template dk
                      WHERE dk.id = n.decoration_id
                        AND COALESCE(dk.meta->>'walkable', '') <> 'true'))
               AND NOT EXISTS (SELECT 1 FROM yuplink.raid_decor_respawn d
                                WHERE d.map_id = n.map_id AND d.q = n.q AND d.r = n.r
                                  AND d.placed_at IS NULL)) = 6
     ORDER BY md5(x.q || ',' || x.r || ':mushroom-20261022')
  LOOP
    -- Не вплотную: шаг до уже выбранных ≥ 2.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM mush_pick p
       WHERE abs(p.q - c.q) + abs(p.r - c.r) + abs((p.q + p.r) - (c.q + c.r)) <= 2);
    INSERT INTO mush_pick (q, r) VALUES (c.q, c.r);
    v_n := v_n + 1;
    EXIT WHEN v_n >= v_need;
  END LOOP;

  UPDATE yuplink.raid_map_cells x
     SET building_id = 'building_3arAnV9ajZ',
         building_config = jsonb_build_object('resource', 'token', 'token', 'Darai',
                                              'yield', 10000, 'captureCost', 5,
                                              'diesAt', v_dies),
         building_skin_id = 'bskin_dm_mushroom',
         saved_at = now()
    FROM mush_pick p
   WHERE x.map_id = v_map AND x.q = p.q AND x.r = p.r AND x.building_id IS NULL;

  SELECT jsonb_agg(jsonb_build_array(p.q, p.r) ORDER BY p.q, p.r) INTO v_cells FROM mush_pick p;
  UPDATE yuplink.settings
     SET value = jsonb_build_object('at', now(), 'diesAt', v_dies, 'map', v_map,
                                    'count', v_n, 'cells', COALESCE(v_cells, '[]'::jsonb))::text
   WHERE key = 'mushroom_scatter:20261022';

  -- Карта перестроена — у всех без F5.
  UPDATE yuplink.raid_maps
     SET revision = COALESCE(revision, 0) + 1, edit_seq = COALESCE(edit_seq, 0) + 1,
         updated_at = now()
   WHERE id = v_map
  RETURNING revision INTO v_rev;
  INSERT INTO yuplink.raid_map_journal (map_id, revision, patch)
  VALUES (v_map, v_rev, '{"full":true}'::jsonb)
  ON CONFLICT (map_id, revision) DO NOTHING;
  PERFORM pg_notify('raid_live', json_build_object(
    'w', 'mushroom-02',
    'e', json_build_object('type', 'map', 'mapId', v_map, 'rev', v_rev, 'full', true))::text);
  RAISE NOTICE 'раскидано грибов: %', v_n;
END $do$;

COMMIT;
