-- Возврат съеденных грибов (владелец, 25.10.2026, ПРАВИЛА §8.85) — к mushroom-07.
--
-- 1. raid_mushroom_respawn_run — ключ вызова обхода и его итог: мост повторяет
--    вызов вслепую, и повтор после потерянного ответа должен вернуть те же клетки
--    (иначе рассылки нет и гриб виден только после F5). Хранится двое суток.
-- 2. raid_mushroom_respawn_due(op, limit) — минутный обход: съеденные, чей срок
--    вышел, встают новым ничейным грибом с полной жизнью на свободной клетке у
--    жилы своего вида (золотой и DARAI — у золотой, алмазный — у алмазной; сначала
--    сама жила). Клетку берём из 40 случайных, нет — из всех. Лимит вида не
--    проверяем: ждущий возврата уже сидит в лимите (mushroom-09). Места нет — следующий
--    проход. Ответ — как у raid_mushroom_spawn_hour (рассылка та же, dmine-spawn).
-- 3. Лимит появления, считающий ждущих возврата, — mushroom-09 (катить вместе).
--
-- Строго ДО кода (код зовёт функцию с ключом). Повтор файла безвреден.
BEGIN;
SET lock_timeout = '5s';

-- ── 1. Ключ вызова обхода.
CREATE TABLE IF NOT EXISTS yuplink.raid_mushroom_respawn_run (
  op  text PRIMARY KEY,
  res jsonb,
  at  timestamptz NOT NULL DEFAULT now()
);

-- Клетки жил вида и их соседей (как слоты появления, mushroom-03).
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_slots(p_vein text)
RETURNS TABLE(map_id text, q integer, r integer, vein_kind text, on_vein boolean)
LANGUAGE sql STABLE AS $fn$
  SELECT v.map_id, v.q, v.r, v.kind, true FROM yuplink.raid_map_vein v WHERE v.kind = p_vein
  UNION ALL
  SELECT v.map_id, v.q + dd.dq, v.r + dd.dr, v.kind, false
    FROM yuplink.raid_map_vein v
   CROSS JOIN (VALUES (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)) dd(dq, dr)
   WHERE v.kind = p_vein
$fn$;

-- ── 2. Возврат съеденных.
DROP FUNCTION IF EXISTS yuplink.raid_mushroom_respawn_due(integer);
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_respawn_due(p_op text, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  e      record;
  c      record;
  m      text;
  v_res  jsonb;
  v_dies timestamptz;
  v_vein text;
  v_n    integer := 0;
  v_out  jsonb := '[]'::jsonb;
  v_maps text[] := '{}';
  v_hour timestamptz := date_trunc('hour', now());
BEGIN
  SELECT r.res INTO v_res FROM yuplink.raid_mushroom_respawn_run r WHERE r.op = p_op;
  IF FOUND THEN RETURN v_res; END IF;
  -- Один обход за раз на все процессы; нечего возвращать — карты не трогаем.
  IF NOT pg_try_advisory_xact_lock(hashtext('mushroom-respawn')) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM yuplink.raid_mushroom_eat
                  WHERE respawned_at IS NULL AND respawn_at <= now()) THEN
    RETURN NULL;
  END IF;
  DELETE FROM yuplink.raid_mushroom_respawn_run WHERE at < now() - interval '2 days';
  -- Карты с жилами — под локом карты, как появление и «Забрать».
  FOR m IN SELECT DISTINCT v.map_id FROM yuplink.raid_map_vein v ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtext('godmove:' || m));
  END LOOP;

  FOR e IN
    SELECT * FROM yuplink.raid_mushroom_eat
     WHERE respawned_at IS NULL AND respawn_at <= now()
     ORDER BY respawn_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200))
     FOR UPDATE SKIP LOCKED
  LOOP
    v_vein := CASE e.kind WHEN 'diamonds' THEN 'diamonds' ELSE 'gold' END;
    -- Сначала 40 случайных клеток (сама жила — первой), проверка — только им.
    SELECT s.* INTO c
      FROM (SELECT a.* FROM yuplink.raid_mushroom_slots(v_vein) a
             ORDER BY a.on_vein DESC, random() LIMIT 40) s
     WHERE yuplink.raid_mushroom_cell_free(s.map_id, s.q, s.r)
     ORDER BY s.on_vein DESC
     LIMIT 1;
    IF NOT FOUND THEN
      SELECT s.* INTO c FROM yuplink.raid_mushroom_slots(v_vein) s
       WHERE yuplink.raid_mushroom_cell_free(s.map_id, s.q, s.r)
       ORDER BY s.on_vein DESC, random()
       LIMIT 1;
    END IF;
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
    -- В общий журнал появлений (mushroom-stats различает возвраты по raid_mushroom_eat).
    INSERT INTO yuplink.raid_mushroom_spawn (hour, kind, map_id, q, r, on_vein, vein_kind, dies_at)
    VALUES (v_hour, e.kind, c.map_id, c.q, c.r, c.on_vein, c.vein_kind, v_dies)
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
END $fn$;

COMMIT;
