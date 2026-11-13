-- Шахты v2 (ПРАВИЛА §8.59), файл 3 из 3: починка, смена режима и перевод
-- нынешних шахт. Накатывать после minev2-01 и minev2-02, ДО кода.
--
--  • raid_mine_repair — починка в любой момент, цена всегда полная (её
--    передаёт сервер из MINE_REPAIR_COST; пустая цена — отказ). Сперва
--    поломка, если пора. Своя — накопленное хозяину, запас 100 %, режим новый,
--    охрана остаётся. Строки нет (сломана/ничья) — забирает тот, кто платит.
--    Чужую работающую — нельзя ('mine_owned'). Повтор того же op ничего не
--    меняет (raid_mine_op), списание — res_move с ключом mrep:<op>:<ресурс>.
--    credited/credited_to — кому и сколько начислено добычи (своя шахта или
--    поломка внутри починки — тогда прежнему хозяину), для ачивки.
--  • raid_mine_set_mode — только хозяин, не сломана: накопленное по старому
--    режиму, остаток запаса пересчитан расходом нового (база 3,5 дня = 50 %;
--    на максимум — 12 ч). Тот же режим — no-op (и повтор моста тоже).
--    credited — начисленное хозяину.
--  • Смена режима и починка своей не теряют неполный час: отрезок закрывается
--    целиком (raid_mine_v2_close из 01) — целые часы и сразу дробный остаток
--    последнего часа по ставке режима, в котором он шёл; новый отрезок — с
--    этой минуты, но не раньше начала прежнего (raid_mine_v2_start(…,
--    GREATEST(now(), accrue_from))), claimed_hours = 0. Щелчки режимов
--    ничего не дают: каждая минута оплачена ровно один раз по своей ставке.
--    Ключи — см. шапку 01.
--  • Перевод: строки v2-вида без accrue_from — накопленное по СТАРОЙ формуле
--    (выход клетки, ключ как у сбора) и остаток часа по тому же выходу, затем
--    база, запас 100 %, отрезок с этой минуты; у каждой шахты карты — своя
--    эпоха до секунды.
-- Ответ repair/set_mode поменялся до выката — отсюда DROP перед CREATE;
-- перенос остатка по выработке (raid_mine_carry_from) заменён доплатой.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS yuplink.raid_mine_carry_from(timestamptz, numeric, text, text);

DROP FUNCTION IF EXISTS yuplink.raid_mine_repair(text, integer, integer, text, text, text, jsonb, text);
CREATE FUNCTION yuplink.raid_mine_repair(
  p_map text, p_q integer, p_r integer, p_account text, p_wallet text,
  p_mode text, p_cost jsonb, p_op text
) RETURNS TABLE(captured boolean, applied boolean, credited numeric, credited_to text)
LANGUAGE plpgsql AS $fn$
DECLARE st yuplink.raid_mine_state; cfg jsonb; v_res text; v_amt numeric; v_new boolean;
        b record; cl record; v_cred numeric := 0; v_to text;
BEGIN
  IF COALESCE(p_account, '') = '' OR COALESCE(p_op, '') = '' THEN RAISE EXCEPTION 'mine_bad_args'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('base', 'mid', 'max') THEN RAISE EXCEPTION 'mine_bad_mode'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mine:'||p_map||':'||p_q||':'||p_r));
  IF EXISTS (SELECT 1 FROM yuplink.raid_mine_op o WHERE o.op = p_op) THEN
    RETURN QUERY SELECT COALESCE((SELECT (o.detail->>'captured')::boolean
                                    FROM yuplink.raid_mine_op o WHERE o.op = p_op), false),
                        false, 0::numeric, NULL::text;
    RETURN;
  END IF;
  SELECT c.building_config INTO cfg FROM yuplink.raid_map_cells c
   WHERE c.map_id=p_map AND c.q=p_q AND c.r=p_r;
  IF yuplink.raid_mine_v2_std(cfg) IS NULL THEN RAISE EXCEPTION 'mine_not_v2'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_each_text(COALESCE(p_cost, '{}'::jsonb)) e
                  WHERE e.key IN ('wood', 'stone', 'gold', 'diamonds')
                    AND e.value ~ '^[0-9]+([.][0-9]+)?$' AND e.value::numeric > 0) THEN
    RAISE EXCEPTION 'mine_bad_cost';
  END IF;
  -- Пора ломаться — ломаем: накопленное уходит прежнему хозяину.
  SELECT * INTO b FROM yuplink.raid_mine_break(p_map, p_q, p_r);
  IF b.broke THEN v_cred := b.amount; v_to := b.owner; END IF;
  SELECT * INTO st FROM yuplink.raid_mine_state x WHERE x.map_id=p_map AND x.q=p_q AND x.r=p_r;
  v_new := NOT FOUND;
  IF NOT v_new AND st.owner_account IS DISTINCT FROM p_account THEN RAISE EXCEPTION 'mine_owned'; END IF;
  -- Строка без accrue_from — шахта ещё не переведена на v2 (до файла 03 не бывает).
  IF NOT v_new AND st.accrue_from IS NULL THEN RAISE EXCEPTION 'mine_not_v2'; END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood', 'stone', 'gold', 'diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'mine_bad_cost'; END IF;
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'mine_repair', 'mrep:'||p_op||':'||v_res);
    END IF;
  END LOOP;
  IF v_new THEN
    INSERT INTO yuplink.raid_mine_state
      (map_id, q, r, owner_account, owner_wallet, captured_at, claimed_hours,
       mode, life_left, life_at, accrue_from)
    VALUES (p_map, p_q, p_r, p_account, p_wallet, now(), 0, p_mode, 1, now(),
            yuplink.raid_mine_v2_start(p_map, p_q, p_r, now()));
  ELSE
    -- Своя: накопленное с неполным часом — по прежнему режиму, дальше с нуля.
    SELECT * INTO cl FROM yuplink.raid_mine_v2_close(st, cfg);
    v_cred := cl.amount; v_to := p_account;
    UPDATE yuplink.raid_mine_state x
       SET mode = p_mode, life_left = 1, life_at = now(), claimed_hours = 0,
           accrue_from = yuplink.raid_mine_v2_start(p_map, p_q, p_r, GREATEST(now(), st.accrue_from))
     WHERE x.map_id=p_map AND x.q=p_q AND x.r=p_r;
  END IF;
  INSERT INTO yuplink.raid_mine_op(op, kind, map_id, q, r, account_id, detail)
  VALUES (p_op, 'repair', p_map, p_q, p_r, p_account,
          jsonb_build_object('mode', p_mode, 'cost', p_cost, 'captured', v_new,
                             'resource', cfg->>'resource'));
  RETURN QUERY SELECT v_new, true, COALESCE(v_cred, 0), CASE WHEN v_cred > 0 THEN v_to END;
END $fn$;

DROP FUNCTION IF EXISTS yuplink.raid_mine_set_mode(text, integer, integer, text, text);
CREATE FUNCTION yuplink.raid_mine_set_mode(
  p_map text, p_q integer, p_r integer, p_account text, p_mode text,
  OUT changed boolean, OUT credited numeric
) LANGUAGE plpgsql AS $fn$
DECLARE st yuplink.raid_mine_state; cfg jsonb; v_left numeric; cl record;
BEGIN
  changed := false; credited := 0;
  IF p_mode IS NULL OR p_mode NOT IN ('base', 'mid', 'max') THEN RAISE EXCEPTION 'mine_bad_mode'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mine:'||p_map||':'||p_q||':'||p_r));
  SELECT c.building_config INTO cfg FROM yuplink.raid_map_cells c
   WHERE c.map_id=p_map AND c.q=p_q AND c.r=p_r;
  IF yuplink.raid_mine_v2_std(cfg) IS NULL THEN RAISE EXCEPTION 'mine_not_v2'; END IF;
  SELECT * INTO st FROM yuplink.raid_mine_state x WHERE x.map_id=p_map AND x.q=p_q AND x.r=p_r;
  IF NOT FOUND THEN RAISE EXCEPTION 'mine_broken'; END IF;
  IF st.owner_account IS DISTINCT FROM p_account THEN RAISE EXCEPTION 'mine_not_owner'; END IF;
  IF st.accrue_from IS NULL THEN RAISE EXCEPTION 'mine_not_v2'; END IF;
  IF now() >= yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at) THEN
    RAISE EXCEPTION 'mine_broken';
  END IF;
  IF st.mode = p_mode THEN RETURN; END IF;
  -- Прошедшее — по старому режиму, с неполным часом; дальше по новому с этой минуты.
  SELECT * INTO cl FROM yuplink.raid_mine_v2_close(st, cfg);
  v_left := GREATEST(0, LEAST(1, st.life_left)
              - extract(epoch FROM (now() - st.life_at)) / 3600.0 / yuplink.raid_mine_mode_hours(st.mode));
  UPDATE yuplink.raid_mine_state x
     SET life_left = round(v_left, 12), life_at = now(), mode = p_mode, claimed_hours = 0,
         accrue_from = yuplink.raid_mine_v2_start(p_map, p_q, p_r, GREATEST(now(), st.accrue_from))
   WHERE x.map_id=p_map AND x.q=p_q AND x.r=p_r;
  changed := true; credited := cl.amount;
END $fn$;

-- Перевод нынешних шахт v2-вида. Накопленное — ровно как старый сбор
-- (raid_mine_claim на проде 20.10: целые часы от захвата, предел maxHours) ×
-- выход клетки, тот же ключ, поэтому повтор и гонка со сбором не задвоят.
-- Остаток часа — тоже по выходу клетки, дробно, ключ …:<эпоха захвата>:tail
-- (у упёршихся в maxHours платить нечего). Новый отрезок — с этой минуты;
-- эпоха у шахт одной карты (любых хозяев) не совпадает до секунды: совпала —
-- +1 с (перенос режимом бога возит строку с эпохой на другую клетку; общая
-- эпоха — ключи сбора совпали бы, начисление молча пропало бы). Остаток
-- считается до начала нового отрезка (с этими секундами): отрезки стыкуются
-- без щели, а смена режима, починка и перехват до этого начала новый отрезок
-- раньше него не начнут. Лок шахты и перечитывание строки под ним — на случай,
-- если кто-то собрал между выборкой и локом.
DO $$
DECLARE d record; st yuplink.raid_mine_state; cfg jsonb; v_yield numeric; hrs numeric;
        due numeric; v_ref text; v_capped boolean; v_from timestamptz; v_tail numeric;
BEGIN
  FOR d IN
    SELECT s.map_id, s.q, s.r
      FROM yuplink.raid_mine_state s
      JOIN yuplink.raid_map_cells c ON c.map_id = s.map_id AND c.q = s.q AND c.r = s.r
     WHERE s.accrue_from IS NULL AND yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL
     ORDER BY s.map_id, s.q, s.r
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('mine:'||d.map_id||':'||d.q||':'||d.r));
    SELECT * INTO st FROM yuplink.raid_mine_state
     WHERE map_id = d.map_id AND q = d.q AND r = d.r AND accrue_from IS NULL;
    CONTINUE WHEN NOT FOUND;
    SELECT building_config INTO cfg FROM yuplink.raid_map_cells
     WHERE map_id = d.map_id AND q = d.q AND r = d.r;
    -- Начало нового отрезка: не эпоха захвата (её хвост), не эпоха соседки по карте.
    v_from := now();
    LOOP
      v_from := yuplink.raid_mine_v2_start(st.map_id, st.q, st.r, v_from);
      EXIT WHEN extract(epoch FROM v_from)::bigint <> extract(epoch FROM st.captured_at)::bigint
            AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_state x
                             WHERE x.map_id = st.map_id AND (x.q, x.r) <> (st.q, st.r)
                               AND x.accrue_from IS NOT NULL
                               AND extract(epoch FROM x.accrue_from)::bigint = extract(epoch FROM v_from)::bigint);
      v_from := v_from + interval '1 second';
    END LOOP;
    v_yield := CASE WHEN cfg->>'yield' ~ '^[0-9]+([.][0-9]+)?$' THEN (cfg->>'yield')::numeric ELSE 0 END;
    hrs := extract(epoch FROM (now() - st.captured_at)) / 3600.0;
    v_capped := COALESCE(cfg->>'maxHours', '') ~ '^[0-9]+([.][0-9]+)?$'
                AND hrs > (cfg->>'maxHours')::numeric;
    IF v_capped THEN hrs := (cfg->>'maxHours')::numeric; END IF;
    due := GREATEST(floor(hrs - COALESCE(st.claimed_hours, 0)), 0);
    v_ref := 'mine:'||st.map_id||':'||st.q||':'||st.r||':'||extract(epoch FROM st.captured_at)::bigint||':';
    IF v_yield > 0 AND due > 0 THEN
      PERFORM yuplink.raid_mine_credit(st.owner_account, st.owner_wallet, cfg->>'resource', NULL,
                                       round(due * v_yield, 4), v_ref||(COALESCE(st.claimed_hours, 0) + due)::text);
    END IF;
    v_tail := CASE WHEN v_capped OR v_yield <= 0 THEN 0
                   ELSE trunc(GREATEST(0, extract(epoch FROM (v_from - st.captured_at)) / 3600.0
                                          - COALESCE(st.claimed_hours, 0) - due) * v_yield, 4) END;
    IF v_tail > 0 THEN
      PERFORM yuplink.raid_mine_credit(st.owner_account, st.owner_wallet, cfg->>'resource', NULL,
                                       v_tail, v_ref||'tail');
    END IF;
    UPDATE yuplink.raid_mine_state
       SET mode = 'base', life_left = 1, life_at = now(), accrue_from = v_from, claimed_hours = 0
     WHERE map_id = d.map_id AND q = d.q AND r = d.r;
  END LOOP;
END $$;

COMMIT;
