-- Съеденный гриб: через 12 часов с шансом 50 % встаёт снова на одной из свободных
-- жил (владелец, 25.10.2026, ПРАВИЛА §8.85; прежний безусловный возврат через 10 ч
-- он отменил — mushroom-10/12).
--
-- 1. raid_mushroom_eat: respawn_roll — итог броска (пусто — ещё не бросали, true —
--    выпало, ждёт свободную жилу, false — не выпало). «Съесть» пишет respawn_at =
--    +12 ч; уже съеденным без срока — от минуты съедения.
-- 2. raid_mushroom_cell_free — клетка годна под гриб (условия ежечасного появления).
-- 3. raid_mushroom_respawn_due(op, limit) — минутный обход: срок вышел — один бросок
--    (50 %); не выпало — закрыть; выпало — гриб того же вида, ничей, с полной жизнью,
--    на свободной клетке ЖИЛЫ своего вида (золотой и DARAI — золотой, алмазный —
--    алмазной), свободной нет — ждёт, без переброса. Ключ вызова — итог для повтора
--    моста (raid_mushroom_respawn_run). Лимит вида не проверяет: ждущий сидит в
--    лимите ежечасного появления (mushroom-14).
--
-- Строго ДО кода. Повтор файла безвреден.
BEGIN;
SET lock_timeout = '5s';

-- ── 1. Журнал: бросок и срок.
ALTER TABLE yuplink.raid_mushroom_eat ADD COLUMN IF NOT EXISTS respawn_roll boolean;
CREATE INDEX IF NOT EXISTS raid_mushroom_eat_due
  ON yuplink.raid_mushroom_eat (respawn_at) WHERE respawned_at IS NULL;
UPDATE yuplink.raid_mushroom_eat SET respawn_at = eaten_at + interval '12 hours'
 WHERE respawned_at IS NULL AND respawn_at IS NULL;
CREATE TABLE IF NOT EXISTS yuplink.raid_mushroom_respawn_run (
  op  text PRIMARY KEY,
  res jsonb,
  at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_eat(
  p_op text, p_account text, p_wallet text, p_hero text, p_kind text, p_cost numeric)
RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  v_prior yuplink.raid_mushroom_eat;
  d       yuplink.raid_dmine;
  v_amt   numeric;
  v_stack text := 'dmine:' || p_kind;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('darai', 'gold', 'diamonds') THEN
    RAISE EXCEPTION 'dmine_no_item';
  END IF;
  -- Лок рюкзака — как у «Посадить» и конца жизни в рюкзаке (рюкзак, потом гриб).
  PERFORM pg_advisory_xact_lock(hashtext('bp:' || p_hero));
  SELECT * INTO v_prior FROM yuplink.raid_mushroom_eat WHERE op = p_op;
  IF FOUND THEN
    RETURN jsonb_build_object('was', true, 'kind', v_prior.kind, 'reward', v_prior.reward,
                              'paid', v_prior.paid);
  END IF;
  -- Гриб вида у этого героя с ближайшим выпадением (как «Посадить», dmine-place-sql).
  SELECT * INTO d FROM yuplink.raid_dmine x
   WHERE x.state = 'item' AND x.hero_id = p_hero AND x.mushroom = p_kind
     AND (x.dies_at IS NULL OR x.dies_at > now())
   ORDER BY LEAST(x.taken_at + interval '1 hour', COALESCE(x.dies_at, 'infinity'::timestamptz)), x.id
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dmine_no_item'; END IF;
  -- Стопка в рюкзаке — есть (как у «Посадить»): без неё гриб не съесть.
  IF NOT EXISTS (SELECT 1 FROM yuplink.raid_hero_backpack b
                  WHERE b.hero_id = p_hero AND b.stack_key = v_stack AND b.count >= 1) THEN
    RAISE EXCEPTION 'dmine_no_item';
  END IF;

  -- Состояние — как у сгоревшего в рюкзаке ('gone': других проверка raid_dmine_state_check
  -- не пускает); что гриб съеден, а не сгорел, — строка этого журнала.
  UPDATE yuplink.raid_dmine SET state = 'gone' WHERE id = d.id AND state = 'item';
  UPDATE yuplink.raid_hero_backpack SET count = count - 1, updated_at = now()
   WHERE hero_id = p_hero AND stack_key = v_stack AND count > 1;
  IF NOT FOUND THEN
    DELETE FROM yuplink.raid_hero_backpack WHERE hero_id = p_hero AND stack_key = v_stack;
  END IF;

  -- Энергия «Съесть» (владелец: 50) — тем же оператором: нехватка (not_enough_energy)
  -- откатывает всё, гриб остаётся в рюкзаке.
  IF p_cost > 0 THEN
    PERFORM yuplink.touch_energy_atomic(p_wallet, p_cost);
  END IF;

  v_amt := CASE p_kind WHEN 'darai' THEN 25000 ELSE 5 END;
  -- Тем же путём, что добыча грибов и шахт: золото и алмазы — на счёт ресурсов,
  -- DARAI — на счёт и минусом из пула карты (ключ — по нажатию).
  PERFORM yuplink.raid_mine_credit(p_account, p_wallet,
            CASE p_kind WHEN 'darai' THEN 'token' ELSE p_kind END,
            CASE p_kind WHEN 'darai' THEN 'Darai' END,
            v_amt, 'mush_eat:' || p_op);

  -- Через 12 часов — шанс 50 % встать снова на свободной жиле (raid_mushroom_respawn_due).
  INSERT INTO yuplink.raid_mushroom_eat (op, account_id, hero_id, dmine_id, kind, reward, paid, respawn_at)
  VALUES (p_op, p_account, p_hero, d.id, p_kind, v_amt, GREATEST(p_cost, 0),
          now() + interval '12 hours');
  RETURN jsonb_build_object('was', false, 'kind', p_kind, 'reward', v_amt,
                            'paid', GREATEST(p_cost, 0));
END $fn$;

-- ── 2. Клетка годна под гриб.
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_cell_free(p_map text, p_q integer, p_r integer)
RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM yuplink.raid_map_cells x
      JOIN yuplink.mystic_item_template t ON t.id = x.terrain_id
     WHERE x.map_id = p_map AND x.q = p_q AND x.r = p_r
       AND NOT (t.name ~* '(вод|water|море|океан|ocean|river|река)')
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
  )
$fn$;

-- ── 3. Возврат: срок вышел — бросок 50 %, выпало — свободная жила своего вида.
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_respawn_due(p_op text, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql AS $fn$
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
  FOR m IN SELECT DISTINCT v.map_id FROM yuplink.raid_map_vein v ORDER BY 1 LOOP
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
END $fn$;

COMMIT;
