-- «Починить всё» (владелец, 05.11.2026): пачка починок своих шахт v2 одной
-- транзакцией — для «Управления шахтами» (src/server/api/mine-office/
-- mine-office-repair-all.ts).
--
-- Каждая клетка чинится той же raid_mine_repair, что и одна шахта (цена с
-- сервера, неполный час, журнал op, ключ повтора), но решение «чинить или
-- пропустить» принимается ПОД ЛОКОМ шахты — два одновременных подтверждения
-- не проскочат оба:
--   'again'     — ключ клетки уже проведён: прежний ответ, цена из журнала, денег нет;
--   'broken'    — строки владения нет (сломанная ничья — не забираем) или
--                 сломается в ближайшие 5 с (по now() транзакции, как raid_mine_break);
--   'not_owner' — хозяин другой (или строка старого образца);
--   'changed'   — отметка запаса не та, что видел игрок (seen, мс): шахту уже
--                 перечинили или сменили режим — старое подтверждение не платит;
--   'spent'     — шахта острова, клетку уже чинили (вторая починка запрещена);
--   'repaired'  — починена.
-- Ключ клетки строит сервер: аккаунт + клетка + seen. Повтор того же
-- подтверждения (и одновременный, и после потерянного ответа) — тот же ключ.
--
-- Локи всех шахт пачки — сначала и по порядку (карта, q, r), деньги — потом:
-- сбор и починка одной шахты берут шахту, затем ресурсы, и с пачкой не
-- сцепляются. Не хватило ресурсов (res_move «в минус») — откат всей пачки.
--
-- Порядок: до кода (код зовёт функцию). Повтор безвреден (CREATE OR REPLACE).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.raid_mine_repair_all(p_account text, p_wallet text, p_cells jsonb)
RETURNS TABLE(o_map text, o_q integer, o_r integer, o_status text, o_captured boolean,
              o_credited numeric, o_credited_to text, o_cost jsonb)
LANGUAGE plpgsql
AS $function$
DECLARE c jsonb; st yuplink.raid_mine_state; cfg jsonb; rep record; v_island boolean;
BEGIN
  IF COALESCE(p_account, '') = '' OR jsonb_typeof(p_cells) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'mine_bad_args';
  END IF;
  FOR c IN SELECT e FROM jsonb_array_elements(p_cells) e
            ORDER BY e->>'map', (e->>'q')::int, (e->>'r')::int LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('mine:'||(c->>'map')||':'||((c->>'q')::int)||':'||((c->>'r')::int)));
  END LOOP;
  FOR c IN SELECT e FROM jsonb_array_elements(p_cells) e
            ORDER BY e->>'map', (e->>'q')::int, (e->>'r')::int LOOP
    o_map := c->>'map'; o_q := (c->>'q')::int; o_r := (c->>'r')::int;
    o_captured := false; o_credited := 0; o_credited_to := NULL; o_cost := c->'cost';
    IF COALESCE(c->>'op', '') = '' THEN RAISE EXCEPTION 'mine_bad_args'; END IF;
    IF EXISTS (SELECT 1 FROM yuplink.raid_mine_op o WHERE o.op = c->>'op') THEN
      SELECT o.detail->'cost', COALESCE((o.detail->>'captured')::boolean, false)
        INTO o_cost, o_captured
        FROM yuplink.raid_mine_op o WHERE o.op = c->>'op';
      o_status := 'again'; RETURN NEXT; CONTINUE;
    END IF;
    SELECT * INTO st FROM yuplink.raid_mine_state x
     WHERE x.map_id = o_map AND x.q = o_q AND x.r = o_r;
    IF NOT FOUND THEN o_status := 'broken'; RETURN NEXT; CONTINUE; END IF;
    IF st.owner_account IS DISTINCT FROM p_account OR st.accrue_from IS NULL THEN
      o_status := 'not_owner'; RETURN NEXT; CONTINUE;
    END IF;
    IF floor(extract(epoch from st.life_at) * 1000) IS DISTINCT FROM (c->>'seen')::numeric THEN
      o_status := 'changed'; RETURN NEXT; CONTINUE;
    END IF;
    IF yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at) <= now() + interval '5 seconds' THEN
      o_status := 'broken'; RETURN NEXT; CONTINUE;
    END IF;
    SELECT x.building_config INTO cfg FROM yuplink.raid_map_cells x
     WHERE x.map_id = o_map AND x.q = o_q AND x.r = o_r;
    v_island := yuplink.raid_mine_is_island(cfg);
    IF v_island AND EXISTS (SELECT 1 FROM yuplink.raid_mine_op o
                             WHERE o.kind = 'repair' AND o.map_id = o_map AND o.q = o_q AND o.r = o_r) THEN
      o_status := 'spent'; RETURN NEXT; CONTINUE;
    END IF;
    SELECT * INTO rep FROM yuplink.raid_mine_repair(o_map, o_q, o_r, p_account, p_wallet,
             CASE WHEN v_island THEN 'base' ELSE st.mode END, c->'cost', c->>'op');
    o_status := 'repaired';
    o_captured := COALESCE(rep.captured, false);
    o_credited := COALESCE(rep.credited, 0);
    o_credited_to := rep.credited_to;
    RETURN NEXT;
  END LOOP;
END $function$;

COMMIT;
