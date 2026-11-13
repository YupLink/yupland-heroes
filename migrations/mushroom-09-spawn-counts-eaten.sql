-- Ежечасное появление грибов (raid_mushroom_spawn_hour, mushroom-03): лимит вида
-- считает и съеденные, ждущие возврата (владелец, 25.10.2026, ПРАВИЛА §8.85) —
-- иначе появление занимает их место, и возврат (mushroom-08) упирается в лимит.
-- Одна вставка UNION ALL; остальное тело — как на проде. Катить с mushroom-07/08,
-- до кода. Повтор безвреден.
BEGIN;
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_spawn_hour(p_op text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_hour  timestamptz := date_trunc('hour', now());
  v_cfg   jsonb;
  v_near  numeric;
  v_gold  integer;
  v_darai integer;
  v_dia   integer;
  v_dies  timestamptz;
  v_n     integer := 0;
  v_out   jsonb := '[]'::jsonb;
  v_maps  text[] := '{}';
  v_res   jsonb;
  m       text;
  c       record;
BEGIN
  -- Ключ часа: второй процесс и следующий обход в этот час не бросают (NULL).
  -- Мост повторяет вслепую: повтор ЭТОГО вызова (тот же p_op) — тот же итог.
  INSERT INTO yuplink.raid_mushroom_hour (hour, op) VALUES (v_hour, p_op)
  ON CONFLICT (hour) DO NOTHING;
  IF NOT FOUND THEN
    RETURN (SELECT h.res FROM yuplink.raid_mushroom_hour h
             WHERE h.hour = v_hour AND h.op = p_op);
  END IF;

  BEGIN
    SELECT s.value::jsonb INTO v_cfg FROM yuplink.settings s WHERE s.key = 'mushroom_spawn';
  EXCEPTION WHEN others THEN
    v_cfg := NULL;
  END;
  v_cfg := COALESCE(v_cfg, '{}'::jsonb);
  v_near := COALESCE(NULLIF(v_cfg->>'near', '')::numeric, 0.1);

  -- Карты с жилами — под локом карты, как постановка и «Забрать».
  FOR m IN SELECT DISTINCT v.map_id FROM yuplink.raid_map_vein v ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtext('godmove:' || m));
  END LOOP;

  -- Лимиты — по всем мирам: живые грибы вида на картах и в рюкзаках (после локов:
  -- свежим снимком, бросок прошлого часа уже записан).
  SELECT 200 - count(*) FILTER (WHERE x.k = 'gold'),
         100 - count(*) FILTER (WHERE x.k = 'darai'),
         10 - count(*) FILTER (WHERE x.k = 'diamonds')
    INTO v_gold, v_darai, v_dia
    FROM (SELECT yuplink.raid_mushroom_kind(cc.building_config) AS k
            FROM yuplink.raid_map_cells cc
           WHERE cc.building_config ? 'diesAt'
             AND (cc.building_config->>'diesAt')::timestamptz > now()
          UNION ALL
          SELECT d.mushroom FROM yuplink.raid_dmine d
           WHERE d.state = 'item' AND (d.dies_at IS NULL OR d.dies_at > now())
          -- Съеденные, ждущие возврата (§8.85, mushroom-08), — тоже живые: их место
          -- не занимаем, иначе возврат упрётся в лимит.
          UNION ALL
          SELECT e.kind FROM yuplink.raid_mushroom_eat e WHERE e.respawned_at IS NULL) x;

  FOR c IN
    -- Клетка — один бросок на вид жилы: на жиле (в т. ч. соседней с другой жилой
    -- гнезда) — шанс вида, рядом (хоть с двумя жилами) — × near.
    WITH slots AS (
      SELECT a.map_id, a.q, a.r, a.vein_kind, bool_or(a.on_vein) AS on_vein,
             CASE WHEN bool_or(a.on_vein) THEN 1::numeric ELSE v_near END AS f
        FROM (SELECT v.map_id, v.q, v.r, v.kind AS vein_kind, true AS on_vein
                FROM yuplink.raid_map_vein v
              UNION ALL
              SELECT v.map_id, v.q + d.dq, v.r + d.dr, v.kind, false
                FROM yuplink.raid_map_vein v
               CROSS JOIN (VALUES (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)) d(dq, dr)) a
       GROUP BY a.map_id, a.q, a.r, a.vein_kind
    ),
    rolls AS (
      SELECT s.map_id, s.q, s.r, s.vein_kind, s.on_vein, k.kind, k.rk
        FROM slots s
       CROSS JOIN (VALUES ('diamonds', 1, 0.002), ('darai', 2, 0.001), ('gold', 3, 0.01))
             k(kind, rk, p0)
       WHERE ((s.vein_kind = 'gold' AND k.kind IN ('gold', 'darai'))
              OR (s.vein_kind = 'diamonds' AND k.kind = 'diamonds'))
         AND random() < COALESCE(NULLIF(v_cfg->>k.kind, '')::numeric, k.p0) * s.f
    ),
    free AS (
      SELECT o.*
        FROM rolls o
        JOIN yuplink.raid_map_cells x ON x.map_id = o.map_id AND x.q = o.q AND x.r = o.r
        JOIN yuplink.mystic_item_template t ON t.id = x.terrain_id
       WHERE NOT (t.name ~* '(вод|water|море|океан|ocean|river|река)')
         AND NOT COALESCE(x.void_fog, false)
         AND NULLIF(btrim(COALESCE(x.road_id, '')), '') IS NULL
         AND x.building_id IS NULL AND x.group_id IS NULL
         AND x.object_id IS NULL AND x.decoration_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_runner z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_dig_hole z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r
                            AND z.dug_at > now() - interval '1 hour')
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_state z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_building_state z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_plan z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
         AND NOT EXISTS (SELECT 1 FROM yuplink.raid_decor_respawn z
                          WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r
                            AND z.placed_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions z
                          WHERE z.q = x.q AND z.r = x.r
                            AND COALESCE(z.map_id, (SELECT (st.value::jsonb)->>'mapId'
                                                      FROM yuplink.settings st
                                                     WHERE st.key = 'beta_raid_map')) = x.map_id)
    ),
    -- На клетке — один гриб: более редкий из выпавших (алмазный, DARAI, золотой).
    best AS (
      SELECT DISTINCT ON (f.map_id, f.q, f.r) f.map_id, f.q, f.r, f.kind, f.on_vein, f.vein_kind
        FROM free f
       ORDER BY f.map_id, f.q, f.r, f.rk, f.on_vein DESC
    )
    SELECT * FROM best ORDER BY random()
  LOOP
    -- Лимит вида по всем мирам.
    CONTINUE WHEN (c.kind = 'gold' AND v_gold <= 0) OR (c.kind = 'darai' AND v_darai <= 0)
               OR (c.kind = 'diamonds' AND v_dia <= 0);
    v_dies := now() + CASE WHEN c.kind = 'diamonds' THEN interval '72 hours'
                           ELSE interval '168 hours' END;
    -- Локи клетки — как у постановки шахт (после карты): сундук и выброс в
    -- мешочек ставят без лока карты; под локом — сверка свежим снимком.
    PERFORM pg_advisory_xact_lock(hashtext('chestcell:' || c.map_id || ':' || c.q || ':' || c.r));
    PERFORM pg_advisory_xact_lock(hashtext('lootdrop:' || c.map_id || ':' || c.q || ':' || c.r));
    PERFORM pg_advisory_xact_lock(hashtext('mine:' || c.map_id || ':' || c.q || ':' || c.r));
    UPDATE yuplink.raid_map_cells x
       SET building_id = 'building_3arAnV9ajZ',
           building_config = CASE c.kind
             WHEN 'darai' THEN jsonb_build_object('resource', 'token', 'token', 'Darai',
                                 'yield', 10000, 'captureCost', 5, 'diesAt', v_dies,
                                 'mushroom', 'darai')
             WHEN 'gold' THEN jsonb_build_object('resource', 'gold', 'yield', 1,
                                 'captureCost', 5, 'diesAt', v_dies, 'mushroom', 'gold')
             ELSE jsonb_build_object('resource', 'diamonds', 'yield', 1,
                                 'captureCost', 5, 'diesAt', v_dies, 'mushroom', 'diamonds')
           END,
           building_skin_id = CASE c.kind WHEN 'darai' THEN 'bskin_dm_mushroom'
                                          WHEN 'gold' THEN 'bskin_dm_gold'
                                          ELSE 'bskin_dm_diamonds' END,
           saved_at = now()
     WHERE x.map_id = c.map_id AND x.q = c.q AND x.r = c.r
       AND x.building_id IS NULL AND x.group_id IS NULL
       AND x.object_id IS NULL AND x.decoration_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_state z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard z
                        WHERE z.map_id = x.map_id AND z.q = x.q AND z.r = x.r);
    CONTINUE WHEN NOT FOUND;
    INSERT INTO yuplink.raid_mushroom_spawn (hour, kind, map_id, q, r, on_vein, vein_kind, dies_at)
    VALUES (v_hour, c.kind, c.map_id, c.q, c.r, c.on_vein, c.vein_kind, v_dies)
    ON CONFLICT (hour, map_id, q, r) DO NOTHING;
    IF c.kind = 'gold' THEN v_gold := v_gold - 1;
    ELSIF c.kind = 'darai' THEN v_darai := v_darai - 1;
    ELSE v_dia := v_dia - 1;
    END IF;
    v_n := v_n + 1;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'map', c.map_id, 'q', c.q, 'r', c.r, 'kind', c.kind,
      'skin', CASE c.kind WHEN 'darai' THEN 'bskin_dm_mushroom' WHEN 'gold' THEN 'bskin_dm_gold'
                          ELSE 'bskin_dm_diamonds' END));
    IF NOT (c.map_id = ANY (v_maps)) THEN v_maps := v_maps || c.map_id; END IF;
  END LOOP;

  UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = ANY (v_maps);
  v_res := jsonb_build_object('hour', v_hour, 'spawned', v_n, 'building', 'building_3arAnV9ajZ',
                              'cells', v_out);
  UPDATE yuplink.raid_mushroom_hour
     SET spawned = v_n, res = v_res,
         chances = jsonb_build_object('gold', COALESCE(NULLIF(v_cfg->>'gold', '')::numeric, 0.01),
                                      'darai', COALESCE(NULLIF(v_cfg->>'darai', '')::numeric, 0.001),
                                      'diamonds', COALESCE(NULLIF(v_cfg->>'diamonds', '')::numeric, 0.002),
                                      'near', v_near)
   WHERE hour = v_hour;
  RETURN v_res;
END $function$;

COMMIT;
