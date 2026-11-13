-- Шахты v2 (ПРАВИЛА §8.59 п. 11): ветка острова новичка. Накатывать ПОСЛЕ
-- minev2-01..03 и ДО кода (код читает raid_mine_op и ждёт отказов ниже).
--
-- ПЕРЕД НАКАТОМ: тела settle, pending, repair и set_mode ниже — копии
-- minev2-01/03 с правками острова (сверяет тест
-- src/server/api/beta-raid/minev2-30-migration.test.ts). Сравнить их с
-- pg_get_functiondef на проде; разошлись — переносить правки на прод-тела.
--
-- Шахта острова — флаг island: true в настройке клетки ({effect:'mine',
-- resource, island:true, yield:1, captureCost:0}, без maxHours — значит v2).
-- Строки raid_mine_state при создании острова нет: шахта стоит сломанной и
-- ничьей, игрок берёт её починкой. Мир не меняется: у клеток мира флага нет,
-- период 1, а floor(x/1)*1 − c ≡ floor(x) − c.
--
--  • raid_mine_is_island(cfg) — флаг клетки (cfg->>'island' = 'true').
--  • raid_mine_v2_std — островная ветка: дерево/камень/золото 1 в час, алмаз
--    1/24 в час, но платится только целыми сутками: 24 × 1/24 после
--    round(…, 4) — ровно 1.
--  • raid_mine_v2_period(cfg) — шаг выплаты, часов: алмаз острова 24, иначе 1.
--  • raid_mine_v2_hours(from, break, claimed, period) — новая перегрузка:
--    целые периоды × период − собранные; 3-аргументная остаётся как была.
--    Без DEFAULT — иначе вызовы с тремя аргументами стали бы неоднозначными.
--  • raid_mine_v2_settle и v2-ветка raid_mine_pending — по периоду клетки;
--    pending округлён до 4 знаков, как начисление в settle.
--  • raid_mine_v2_close — у шахты с периодом больше часа (алмаз острова)
--    дробного хвоста нет: только целые сутки.
--  • raid_mine_repair на острове: только 'base' ('mine_island_mode'); клетку,
--    которую уже чинили (строка raid_mine_op kind='repair'), больше не чинят
--    никогда ('mine_spent'): 7 дней — и шахта выработана. Повтор того же op
--    проверяется РАНЬШЕ — ретрай моста после коммита получит прежний ответ.
--  • raid_mine_set_mode на острове: не 'base' — 'mine_island_mode'.
--  • raid_mine_op_cell — индекс для поиска починок клетки.
-- Поломку (minev2-02) менять не нужно: островная шахта ломается ровно через
-- 168 ч после починки (life_at = accrue_from = now()), 168 делится на 24;
-- хвост при поломке считает close — у алмаза острова его нет.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Шахта острова новичка — флаг клетки.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_is_island(p_cfg jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT COALESCE(p_cfg->>'island' = 'true', false)
$fn$;

-- Стандарт в час шахты v2 по настройке клетки; NULL — шахта старого образца.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_std(p_cfg jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN COALESCE(p_cfg->>'maxHours', '') ~ '^[0-9]+([.][0-9]+)?$'
         AND (p_cfg->>'maxHours')::numeric > 0 THEN NULL
    -- Остров: дерево/камень/золото 1, алмаз 1/24 в час (платится целыми сутками).
    WHEN yuplink.raid_mine_is_island(p_cfg) THEN CASE p_cfg->>'resource'
           WHEN 'wood' THEN 1 WHEN 'stone' THEN 1 WHEN 'gold' THEN 1
           WHEN 'diamonds' THEN 1::numeric / 24
         END
    ELSE CASE p_cfg->>'resource'
           WHEN 'wood' THEN 10 WHEN 'stone' THEN 1 WHEN 'gold' THEN 1 WHEN 'diamonds' THEN 1
         END
  END::numeric
$fn$;

-- Шаг выплаты, часов: алмазная шахта острова — сутки, остальные — час.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_period(p_cfg jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT (CASE WHEN yuplink.raid_mine_is_island(p_cfg) AND p_cfg->>'resource' = 'diamonds'
               THEN 24 ELSE 1 END)::numeric
$fn$;

-- Целые периоды к выдаче (в часах): от начала отрезка до min(сейчас, поломка),
-- вниз до кратного периоду, минус собранные. Период 1 — как 3-аргументная.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_hours(
  p_from timestamptz, p_break timestamptz, p_claimed numeric, p_period numeric)
RETURNS numeric LANGUAGE sql STABLE AS $fn$
  SELECT GREATEST(0, floor(extract(epoch FROM (LEAST(now(), p_break) - p_from)) / 3600
                           / GREATEST(COALESCE(p_period, 1), 1))
                     * GREATEST(COALESCE(p_period, 1), 1)
                     - COALESCE(p_claimed, 0))
$fn$;

-- Начислить хозяину накопленное v2 — тело minev2-01, часы целыми периодами.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_settle(
  p_st yuplink.raid_mine_state, p_cfg jsonb, p_tag text,
  OUT amount numeric, OUT due numeric, OUT ref text
) LANGUAGE plpgsql AS $fn$
DECLARE v_std numeric; v_from timestamptz;
BEGIN
  amount := 0; due := 0; ref := NULL;
  v_std := yuplink.raid_mine_v2_std(p_cfg);
  IF v_std IS NULL OR p_st.accrue_from IS NULL OR p_st.owner_account IS NULL THEN RETURN; END IF;
  v_from := p_st.accrue_from;
  due := yuplink.raid_mine_v2_hours(v_from,
           yuplink.raid_mine_break_at(p_st.mode, p_st.life_left, p_st.life_at), p_st.claimed_hours,
           yuplink.raid_mine_v2_period(p_cfg));
  IF due <= 0 THEN due := 0; RETURN; END IF;
  amount := round(due * v_std * yuplink.raid_mine_mode_mult(p_st.mode), 4);
  ref := 'mine:'||p_st.map_id||':'||p_st.q||':'||p_st.r||':'||extract(epoch FROM v_from)::bigint
         ||':'||COALESCE(p_tag, '')||(COALESCE(p_st.claimed_hours, 0) + due)::text;
  PERFORM yuplink.raid_mine_credit(p_st.owner_account, p_st.owner_wallet, p_cfg->>'resource', NULL, amount, ref);
  UPDATE yuplink.raid_mine_state SET claimed_hours = COALESCE(claimed_hours, 0) + due
   WHERE map_id = p_st.map_id AND q = p_st.q AND r = p_st.r;
END $fn$;

-- Закрытие отрезка (смена режима, починка своей, поломка): целые часы + хвост.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_close(
  p_st yuplink.raid_mine_state, p_cfg jsonb, OUT amount numeric, OUT tail numeric
) LANGUAGE plpgsql AS $fn$
DECLARE v_std numeric; s record;
BEGIN
  amount := 0; tail := 0;
  v_std := yuplink.raid_mine_v2_std(p_cfg);
  IF v_std IS NULL OR p_st.accrue_from IS NULL OR p_st.owner_account IS NULL THEN RETURN; END IF;
  SELECT * INTO s FROM yuplink.raid_mine_v2_settle(p_st, p_cfg, '');
  -- Остров (§8.59 п. 11): алмаз платится только целыми сутками — без дробного хвоста.
  IF yuplink.raid_mine_v2_period(p_cfg) > 1 THEN amount := s.amount; RETURN; END IF;
  -- Вниз (trunc), не round: подгадав момент смены режима, лишнюю 0,00005 не выбить.
  tail := trunc(GREATEST(0, extract(epoch FROM (LEAST(now(),
              yuplink.raid_mine_break_at(p_st.mode, p_st.life_left, p_st.life_at)) - p_st.accrue_from)) / 3600.0
            - (COALESCE(p_st.claimed_hours, 0) + s.due))
          * v_std * yuplink.raid_mine_mode_mult(p_st.mode), 4);
  IF tail > 0 THEN
    PERFORM yuplink.raid_mine_credit(p_st.owner_account, p_st.owner_wallet, p_cfg->>'resource', NULL, tail,
      'mine:'||p_st.map_id||':'||p_st.q||':'||p_st.r||':'||extract(epoch FROM p_st.accrue_from)::bigint||':tail');
  ELSE
    tail := 0;
  END IF;
  amount := s.amount + tail;
END $fn$;

-- Тело minev2-01 (с прода), v2-ветка — целыми периодами, до 4 знаков.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_pending(p_map text, p_q integer, p_r integer)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE st record; cfg jsonb; v_yield numeric; h int; due int; v_std numeric;
BEGIN
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT building_config INTO cfg FROM yuplink.raid_map_cells WHERE map_id=p_map AND q=p_q AND r=p_r;
  -- Шахты v2 (§8.59): стандарт × режим, часы от начала отрезка до поломки.
  v_std := yuplink.raid_mine_v2_std(cfg);
  IF v_std IS NOT NULL AND st.accrue_from IS NOT NULL THEN
    RETURN round(yuplink.raid_mine_v2_hours(st.accrue_from,
             yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at), st.claimed_hours,
             yuplink.raid_mine_v2_period(cfg))
           * v_std * yuplink.raid_mine_mode_mult(st.mode), 4);
  END IF;
  v_yield := COALESCE((cfg->>'yield')::numeric,0);
  IF cfg->>'resource' IS NULL OR v_yield<=0 THEN RETURN 0; END IF;
  h := floor(extract(epoch FROM (now()-COALESCE(st.accrue_from, st.captured_at)))/3600)::int;
  -- Предел добычи (maxHours в настройке клетки) — лесопилка острова, неделя.
  IF (cfg->>'maxHours') IS NOT NULL THEN h := LEAST(h, (cfg->>'maxHours')::int); END IF;
  due := h - COALESCE(st.claimed_hours,0)::int;
  IF due<=0 THEN RETURN 0; END IF;
  RETURN due * v_yield;
END; $function$;

-- Тело minev2-03 + остров: только «База», одна починка на клетку.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_repair(
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
  -- Остров (§8.59 п. 11): только «База»; клетку чинят один раз навсегда —
  -- работает она или выработана, второй починки нет. Повтор того же op уже
  -- ответил выше прежним ответом.
  IF yuplink.raid_mine_is_island(cfg) THEN
    IF p_mode <> 'base' THEN RAISE EXCEPTION 'mine_island_mode'; END IF;
    IF EXISTS (SELECT 1 FROM yuplink.raid_mine_op o
                WHERE o.kind = 'repair' AND o.map_id = p_map AND o.q = p_q AND o.r = p_r) THEN
      RAISE EXCEPTION 'mine_spent';
    END IF;
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

-- Тело minev2-03 + остров: только «База».
CREATE OR REPLACE FUNCTION yuplink.raid_mine_set_mode(
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
  -- Остров (§8.59 п. 11): только «База» (её же — штатный no-op ниже).
  IF yuplink.raid_mine_is_island(cfg) AND p_mode <> 'base' THEN RAISE EXCEPTION 'mine_island_mode'; END IF;
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

CREATE INDEX IF NOT EXISTS raid_mine_op_cell
  ON yuplink.raid_mine_op (map_id, q, r) WHERE kind = 'repair';

COMMIT;
