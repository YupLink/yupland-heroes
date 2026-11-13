-- Разборка шахты (§8.70): ресурсы возврата — сразу на счёт разобравшего
-- (просьба игрока, владелец 25.10.2026: «давай всё сделаем»): «при разборе
-- шахты ресурсы за неё сразу шли на баланс. Сейчас они падают мешком, смысла
-- в котором 0, т.к. ресурсы не занимают место в инвентаре».
--
-- Тело — с прода (pg_get_functiondef, = minecap-01). Сигнатура та же, порции
-- p_items — те же, что шлёт код (mine-dismantle-sql.ts), поэтому порядок
-- выката не важен: старый код с новой функцией — ресурсы на счёт; новый код
-- со старой — по-старому мешочком. Повтор безвреден (CREATE OR REPLACE).
--
-- Разница с продом:
--  • порции 'resource' (дерево, камень, золото, алмазы) в мешочек больше не
--    кладутся: res_move на счёт p_account той же транзакцией, после энергии и
--    пустой клетки; вид 'mine_dismantle' (не доход шахты — турниры и ачивки
--    его не считают, как прежний 'bag_take'), ключ '<ключ нажатия>:<ресурс>' —
--    повтор не задваивает (и ключ разборки отвечает прошлым итогом раньше);
--    до 0,0001 (res_ledger numeric(20,4));
--  • мешочек — только для товаров ('custom:<id>', как было); товаров нет —
--    нет и мешочка;
--  • итог (и detail ключа нажатия) — с 'got': {ресурс: сколько начислено}.
-- Динамит (raid_dynamite_blast) и посаженное (decor-05) зовут с '[]'::jsonb —
-- ни мешочка, ни начисления, как было.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.raid_mine_dismantle(p_op text, p_map text, p_q integer, p_r integer, p_account text, p_cost numeric, p_items jsonb, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
  c       record;
  b       record;
  r_it    record;
  v_prev  jsonb;
  v_bag   text := 'lb_' || md5('mdis:' || COALESCE(p_op, ''));
  v_n     integer := 0;
  v_res   jsonb;
  v_cap   timestamptz;
  v_items jsonb := CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END;
  v_goods jsonb;
  v_got   jsonb := '{}'::jsonb;
  v_ok    boolean;
BEGIN
  IF COALESCE(p_account, '') = '' OR COALESCE(p_op, '') = '' OR p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'mine_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('godmove:' || p_map));
  PERFORM pg_advisory_xact_lock(hashtext('chestcell:' || p_map || ':' || p_q || ':' || p_r));
  PERFORM pg_advisory_xact_lock(hashtext('lootdrop:' || p_map || ':' || p_q || ':' || p_r));
  PERFORM pg_advisory_xact_lock(hashtext('mine:' || p_map || ':' || p_q || ':' || p_r));

  SELECT o.detail INTO v_prev FROM yuplink.raid_mine_op o
   WHERE o.op = p_op AND o.kind = 'dismantle';
  IF FOUND THEN RETURN v_prev || jsonb_build_object('was', true); END IF;
  IF EXISTS (SELECT 1 FROM yuplink.raid_mine_op o WHERE o.op = p_op) THEN
    RAISE EXCEPTION 'mine_bad_args';
  END IF;

  SELECT cc.building_id, cc.building_config, cc.group_id INTO c
    FROM yuplink.raid_map_cells cc
   WHERE cc.map_id = p_map AND cc.q = p_q AND cc.r = p_r
     FOR UPDATE;
  IF NOT FOUND OR c.building_id IS NULL THEN RAISE EXCEPTION 'mine_gone'; END IF;
  IF yuplink.raid_mine_v2_std(c.building_config) IS NULL THEN
    RAISE EXCEPTION 'mine_no_dismantle';
  END IF;
  IF yuplink.raid_mine_is_island(c.building_config) OR left(p_map, 5) = 'isle_' THEN
    RAISE EXCEPTION 'mine_no_dismantle';
  END IF;

  -- Срок вышел, обход ещё не прошёл — сломать, как он (§8.59 п. 4); строка
  -- журнала этой поломки — «разобрали» (эпоха владения — captured_at).
  SELECT s.captured_at INTO v_cap FROM yuplink.raid_mine_state s
   WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r;
  SELECT * INTO b FROM yuplink.raid_mine_break(p_map, p_q, p_r);
  IF EXISTS (SELECT 1 FROM yuplink.raid_mine_state s
              WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r) THEN
    RAISE EXCEPTION 'mine_working';
  END IF;
  IF b.broke THEN
    UPDATE yuplink.raid_mine_capture_log
       SET kind = 'dismantle'
     WHERE map_id = p_map AND q = p_q AND r = p_r AND old_captured_at = v_cap
       AND kind = 'break' AND claimed_at IS NULL;
  END IF;

  IF p_cost > 0 THEN
    PERFORM yuplink.energy_touch_acc(p_account, p_cost);
  END IF;

  DELETE FROM yuplink.beta_raid_building_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  DELETE FROM yuplink.raid_mine_guard g
   WHERE g.map_id = p_map AND g.q = p_q AND g.r = p_r
     AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc
                      WHERE mc.map_id = p_map AND mc.q = p_q AND mc.r = p_r);
  UPDATE yuplink.raid_map_cells
     SET building_id = NULL, building_config = NULL, building_skin_id = NULL, saved_at = now()
   WHERE map_id = p_map AND q = p_q AND r = p_r;
  IF c.group_id IS NOT NULL THEN
    UPDATE yuplink.raid_map_cells
       SET group_id = NULL, icon_scale = NULL, saved_at = now()
     WHERE map_id = p_map AND group_id = c.group_id;
  END IF;
  -- Правка карты: черновик редактора, открытый до неё, шахту назад не вернёт.
  UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = p_map;

  -- Мешочек — только товары; ресурсы идут на счёт ниже.
  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO v_goods
    FROM jsonb_array_elements(v_items) AS e
   WHERE e->>'kind' = 'custom';
  IF jsonb_array_length(v_goods) > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('lootbag:' || v_bag));
    INSERT INTO yuplink.raid_loot_bag
      (id, map_id, q, r, created_at, dropped_by, source, source_name, updated_at)
    VALUES (v_bag, p_map, p_q, p_r, now(), p_account, 'mine', p_name, now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO yuplink.raid_loot_bag_item
      (bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count,
       mob_count, mine_count, field_count, loot_count)
    SELECT v_bag, v.k, now() + make_interval(hours => v.h), v.kind, v.ref,
           CASE WHEN v.kind = 'custom' THEN ci.id END,
           COALESCE(ci.name, v.name), COALESCE(ci.image, v.image), v.n, 0, 0, 0, 0
      FROM jsonb_to_recordset(v_goods)
           AS v(k text, kind text, ref text, name text, image text, n numeric, h integer)
      LEFT JOIN yuplink.raid_custom_item ci ON v.kind = 'custom' AND ci.id = v.ref
     WHERE v.n > 0 AND v.h > 0 AND (v.kind <> 'custom' OR ci.id IS NOT NULL)
    ON CONFLICT (bag_id, stack_key, expires_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN DELETE FROM yuplink.raid_loot_bag WHERE id = v_bag; END IF;
  END IF;

  -- Ресурсы возврата — сразу на счёт разобравшего (res_move сам держит лок счёта).
  FOR r_it IN
    SELECT v.ref AS res, sum(trunc(v.n, 4)) AS n
      FROM jsonb_to_recordset(v_items) AS v(kind text, ref text, n numeric)
     WHERE v.kind = 'resource' AND v.ref IN ('wood', 'stone', 'gold', 'diamonds') AND v.n > 0
     GROUP BY v.ref
    HAVING sum(trunc(v.n, 4)) > 0
     ORDER BY v.ref
  LOOP
    SELECT m.applied INTO v_ok
      FROM yuplink.res_move(p_account, r_it.res, r_it.n, 'mine_dismantle', p_op || ':' || r_it.res) m;
    IF v_ok THEN v_got := v_got || jsonb_build_object(r_it.res, r_it.n); END IF;
  END LOOP;

  v_res := jsonb_build_object(
    'bag', CASE WHEN v_n > 0 THEN v_bag END,
    'got', v_got,
    'paid', p_cost,
    'resource', c.building_config->>'resource',
    'block', c.group_id IS NOT NULL,
    'credited', COALESCE(b.amount, 0),
    'credited_to', CASE WHEN COALESCE(b.amount, 0) > 0 THEN b.owner END,
    'items', COALESCE(p_items, '[]'::jsonb));
  INSERT INTO yuplink.raid_mine_op (op, kind, map_id, q, r, account_id, detail)
  VALUES (p_op, 'dismantle', p_map, p_q, p_r, p_account, v_res);
  RETURN v_res || jsonb_build_object('was', false);
END $fn$;

COMMIT;
