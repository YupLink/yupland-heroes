-- Жилы игроков (владелец, 29.10.2026: жилы — товар лавки, игрок кладёт их накладкой) НЕ места
-- появления грибов: грибы — DARAI, а раскладка грибов по жилам (mushroom-03 … -14) задумана на
-- жилах карты. Иначе игрок «подтягивал» бы грибы к своему дому. Правило прежнее — грибы только на
-- жилах карты; включить и для жил игроков — словом владельца.
--
-- 1. raid_map_vein.placed_by — аккаунт, положивший жилу; NULL — жила карты (minev2-30/31, админ).
-- 2. raid_mushroom_spawn_hour и raid_mushroom_respawn_due — ровно прод-версии (pg_get_functiondef
--    на 29.10.2026), изменение одно: жилы (и локи их карт) берутся только с placed_by IS NULL.
-- Порядок: до кода жил (vein-01, затем этот). Одной транзакцией: psql -1. Повтор безвреден.
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_map_vein ADD COLUMN IF NOT EXISTS placed_by text;

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
  FOR m IN SELECT DISTINCT v.map_id FROM yuplink.raid_map_vein v WHERE v.placed_by IS NULL ORDER BY 1 LOOP
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
          -- Съеденные, ждущие броска или жилы (§8.85, mushroom-13), — тоже живые: их
          -- место не занимаем, иначе выпавший возврат упрётся в лимит.
          UNION ALL
          SELECT e.kind FROM yuplink.raid_mushroom_eat e
           WHERE e.respawned_at IS NULL AND e.respawn_at IS NOT NULL
             AND e.respawn_roll IS DISTINCT FROM false) x;

  FOR c IN
    -- Клетка — один бросок на вид жилы: на жиле (в т. ч. соседней с другой жилой
    -- гнезда) — шанс вида, рядом (хоть с двумя жилами) — × near.
    WITH slots AS (
      SELECT a.map_id, a.q, a.r, a.vein_kind, bool_or(a.on_vein) AS on_vein,
             CASE WHEN bool_or(a.on_vein) THEN 1::numeric ELSE v_near END AS f
        FROM (SELECT v.map_id, v.q, v.r, v.kind AS vein_kind, true AS on_vein
                FROM yuplink.raid_map_vein v
               WHERE v.placed_by IS NULL
              UNION ALL
              SELECT v.map_id, v.q + d.dq, v.r + d.dr, v.kind, false
                FROM yuplink.raid_map_vein v
               CROSS JOIN (VALUES (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)) d(dq, dr)
               WHERE v.placed_by IS NULL) a
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

CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_respawn_due(p_op text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  e      record;
  c      record;
  m      text;
  v_res  jsonb;
  v_win  boolean;
  v_dies timestamptz;
  v_n    integer := 0;
  v_out  jsonb := '[]'::jsonb;
  v_maps text[] := '{}';
  v_hour timestamptz := date_trunc('hour', now());
BEGIN
  -- Обход — по одному (ждём, а не уходим): повтор моста, пришедший, пока первый вызов
  -- ещё идёт, дождётся его и вернёт те же клетки по ключу.
  PERFORM pg_advisory_xact_lock(hashtext('mushroom-respawn'));
  SELECT r.res INTO v_res FROM yuplink.raid_mushroom_respawn_run r WHERE r.op = p_op;
  IF FOUND THEN RETURN v_res; END IF;
  IF NOT EXISTS (SELECT 1 FROM yuplink.raid_mushroom_eat
                  WHERE respawned_at IS NULL AND respawn_at <= now()) THEN
    RETURN NULL;
  END IF;
  DELETE FROM yuplink.raid_mushroom_respawn_run WHERE at < now() - interval '2 days';
  FOR m IN SELECT DISTINCT v.map_id FROM yuplink.raid_map_vein v WHERE v.placed_by IS NULL ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtext('godmove:' || m));
  END LOOP;

  FOR e IN
    SELECT * FROM yuplink.raid_mushroom_eat
     WHERE respawned_at IS NULL AND respawn_at <= now()
     -- Выпавшие и ждущие жилу — в конец: не загораживают броски остальных.
     ORDER BY (respawn_roll IS TRUE), respawn_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200))
     FOR UPDATE SKIP LOCKED
  LOOP
    -- Один бросок на гриб: выпавшее ждёт свободную жилу без переброса.
    v_win := COALESCE(e.respawn_roll, random() < 0.5);
    IF e.respawn_roll IS NULL THEN
      UPDATE yuplink.raid_mushroom_eat SET respawn_roll = v_win WHERE op = e.op;
    END IF;
    IF NOT v_win THEN
      UPDATE yuplink.raid_mushroom_eat SET respawned_at = now() WHERE op = e.op;
      CONTINUE;
    END IF;
    SELECT v.map_id, v.q, v.r, v.kind AS vein_kind INTO c
      FROM yuplink.raid_map_vein v
     WHERE v.kind = CASE e.kind WHEN 'diamonds' THEN 'diamonds' ELSE 'gold' END
       AND v.placed_by IS NULL
       AND yuplink.raid_mushroom_cell_free(v.map_id, v.q, v.r)
     ORDER BY random()
     LIMIT 1;
    CONTINUE WHEN NOT FOUND;
    v_dies := now() + CASE WHEN e.kind = 'diamonds' THEN interval '72 hours'
                           ELSE interval '168 hours' END;
    PERFORM pg_advisory_xact_lock(hashtext('chestcell:' || c.map_id || ':' || c.q || ':' || c.r));
    PERFORM pg_advisory_xact_lock(hashtext('lootdrop:' || c.map_id || ':' || c.q || ':' || c.r));
    PERFORM pg_advisory_xact_lock(hashtext('mine:' || c.map_id || ':' || c.q || ':' || c.r));
    CONTINUE WHEN NOT yuplink.raid_mushroom_cell_free(c.map_id, c.q, c.r);
    UPDATE yuplink.raid_map_cells x
       SET building_id = 'building_3arAnV9ajZ',
           building_config = CASE e.kind
             WHEN 'darai' THEN jsonb_build_object('resource', 'token', 'token', 'Darai',
                                 'yield', 10000, 'captureCost', 5, 'diesAt', v_dies,
                                 'mushroom', 'darai')
             WHEN 'gold' THEN jsonb_build_object('resource', 'gold', 'yield', 1,
                                 'captureCost', 5, 'diesAt', v_dies, 'mushroom', 'gold')
             ELSE jsonb_build_object('resource', 'diamonds', 'yield', 1,
                                 'captureCost', 5, 'diesAt', v_dies, 'mushroom', 'diamonds')
           END,
           building_skin_id = CASE e.kind WHEN 'darai' THEN 'bskin_dm_mushroom'
                                          WHEN 'gold' THEN 'bskin_dm_gold'
                                          ELSE 'bskin_dm_diamonds' END,
           saved_at = now()
     WHERE x.map_id = c.map_id AND x.q = c.q AND x.r = c.r AND x.building_id IS NULL;
    CONTINUE WHEN NOT FOUND;
    UPDATE yuplink.raid_mushroom_eat
       SET respawned_at = now(), respawn_map = c.map_id, respawn_q = c.q, respawn_r = c.r
     WHERE op = e.op;
    INSERT INTO yuplink.raid_mushroom_spawn (hour, kind, map_id, q, r, on_vein, vein_kind, dies_at)
    VALUES (v_hour, e.kind, c.map_id, c.q, c.r, true, c.vein_kind, v_dies)
    ON CONFLICT (hour, map_id, q, r) DO NOTHING;
    v_n := v_n + 1;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'map', c.map_id, 'q', c.q, 'r', c.r, 'kind', e.kind,
      'skin', CASE e.kind WHEN 'darai' THEN 'bskin_dm_mushroom' WHEN 'gold' THEN 'bskin_dm_gold'
                          ELSE 'bskin_dm_diamonds' END));
    IF NOT (c.map_id = ANY (v_maps)) THEN v_maps := v_maps || c.map_id; END IF;
  END LOOP;

  IF v_n = 0 THEN RETURN NULL; END IF;
  UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = ANY (v_maps);
  v_res := jsonb_build_object('hour', v_hour, 'spawned', v_n, 'building', 'building_3arAnV9ajZ',
                              'cells', v_out);
  INSERT INTO yuplink.raid_mushroom_respawn_run (op, res) VALUES (p_op, v_res)
  ON CONFLICT (op) DO NOTHING;
  RETURN v_res;
END $function$;
