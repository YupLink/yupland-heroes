-- Отнятая шахта или гриб: несобранное — НЕ на счёт, а строкой к «Забрать»
-- (владелец, 23.10.2026: «Зачислять сразу на баланс этот пендинг нельзя.
-- Запрещено… Нужно, чтобы пользователь сам нажал кнопку Забрать»).
--
-- СТРОГО ДО КОДА (код читает новые колонки и зовёт raid_mine_lost_claim).
-- Повтор безвреден: колонки IF NOT EXISTS, функции CREATE OR REPLACE, отметка
-- старых строк «уже забрано» — только в момент появления колонки claimed_at.
--
-- Было: захват (raid_mine_capture / _v2), подъём гриба (raid_dmine_take →
-- raid_mine_capture), поломка (raid_mine_break: обход, починка, разборка),
-- конец жизни гриба (raid_mushroom_expire_cell → raid_mine_claim) сразу
-- клали прежнему хозяину несобранное на счёт (raid_mine_credit). Снос острова
-- делал то же из кода (island-mine-claim → raid_mine_claim).
--
-- Стало:
--  • raid_mine_capture_log — журнал потерь: kind (capture | take | break |
--    dismantle | expire | island), claimed_at («забрано»), tail/tail_ref
--    (неполный час при поломке, §8.59 п. 10), notified_at (письмо/тост ушли);
--    new_account может быть пуст (поломка, гниль, остров). Нового хозяина
--    журнал хранит, но наружу его не отдаёт никто (владелец, 23.10).
--  • raid_mine_lose(карта, q, r, вид, новый) — считает то же, что прежние пути
--    (целые часы; у поломки — и хвост часа), тем же ключом (…:cap<N> у
--    захвата и подъёма, …:<N> у прочих), и пишет строку. На счёт — ничего.
--    Лок шахты держит вызывающий; строку владения меняет/удаляет тоже он.
--  • raid_mine_lost_claim(id, аккаунт, кошелёк) — «Забрать»: только своя
--    строка, под локом строки; raid_mine_credit тем же ключом (повтор не
--    задваивает, DARAI списывает пул карты), claimed_at — той же транзакцией.
--  • raid_mine_island_release — снос острова: строка 'island' и снятие
--    владения одной транзакцией (только карты isle_).
--  • raid_mine_lost_due — строки для письма и тоста: не чаще раза в минуту
--    на игрока, один обход за раз (pg_try_advisory_xact_lock).
--  • raid_mine_v2_start — эпоха нового отрезка обходит и хвост, ждущий в
--    журнале (раньше хвост сразу лежал в res_ledger).
-- Старые строки (до этой миграции) деньги уже получили: claimed_at = seized_at,
-- notified_at = seized_at — второй раз не выдаются и не шлются.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'yuplink' AND table_name = 'raid_mine_capture_log'
                    AND column_name = 'claimed_at') THEN
    ALTER TABLE yuplink.raid_mine_capture_log
      ADD COLUMN claimed_at timestamptz,
      ADD COLUMN IF NOT EXISTS notified_at timestamptz;
    UPDATE yuplink.raid_mine_capture_log
       SET claimed_at = seized_at, notified_at = COALESCE(notified_at, seized_at);
  END IF;
END $mig$;

ALTER TABLE yuplink.raid_mine_capture_log
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'capture',
  ADD COLUMN IF NOT EXISTS tail numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tail_ref text,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;
ALTER TABLE yuplink.raid_mine_capture_log ALTER COLUMN new_account DROP NOT NULL;

-- «Добыча»: незабранные строки игрока, без срока.
CREATE INDEX IF NOT EXISTS raid_mine_capture_log_unclaimed_idx
  ON yuplink.raid_mine_capture_log (old_account, seized_at DESC) WHERE claimed_at IS NULL;
-- Письма: ещё не уведомлённые; и «когда игроку писали последний раз».
CREATE INDEX IF NOT EXISTS raid_mine_capture_log_notify_idx
  ON yuplink.raid_mine_capture_log (seized_at) WHERE notified_at IS NULL;
CREATE INDEX IF NOT EXISTS raid_mine_capture_log_notified_idx
  ON yuplink.raid_mine_capture_log (old_account, notified_at);
CREATE INDEX IF NOT EXISTS raid_mine_capture_log_tail_ref_idx
  ON yuplink.raid_mine_capture_log (tail_ref) WHERE tail_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_lose(p_map text, p_q integer, p_r integer, p_kind text, p_new text)
 RETURNS text
 LANGUAGE plpgsql
AS $fn$
DECLARE st yuplink.raid_mine_state; cfg jsonb; v_std numeric; v_res text; v_tok text;
        v_yield numeric := 0; v_from timestamptz; v_brk timestamptz; v_tag text;
        hrs numeric := 0; due numeric := 0; amt numeric := 0; v_ref text;
        v_tail numeric := 0; v_tref text; v_id text;
BEGIN
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  IF NOT FOUND OR st.owner_account IS NULL THEN RETURN NULL; END IF;
  SELECT building_config INTO cfg FROM yuplink.raid_map_cells WHERE map_id = p_map AND q = p_q AND r = p_r;
  v_tag := CASE WHEN p_kind IN ('capture', 'take') THEN 'cap' ELSE '' END;
  v_std := yuplink.raid_mine_v2_std(cfg);
  IF v_std IS NOT NULL AND st.accrue_from IS NOT NULL THEN
    -- Шахта v2 (§8.59): стандарт × режим, часы до этой минуты или до поломки.
    v_res := cfg->>'resource';
    v_yield := v_std * yuplink.raid_mine_mode_mult(st.mode);
    v_from := st.accrue_from;
    v_brk := yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at);
    hrs := GREATEST(extract(epoch FROM (LEAST(now(), v_brk) - v_from)) / 3600.0, 0);
    due := yuplink.raid_mine_v2_hours(v_from, v_brk, st.claimed_hours, yuplink.raid_mine_v2_period(cfg));
    IF due > 0 THEN
      amt := round(due * v_yield, 4);
    ELSE
      due := 0;
    END IF;
    -- Поломка: и неполный последний час, дробно, вниз (как raid_mine_v2_close);
    -- алмаз острова платится только сутками — без хвоста.
    IF p_kind = 'break' AND yuplink.raid_mine_v2_period(cfg) <= 1 THEN
      v_tail := trunc(GREATEST(0, hrs - (COALESCE(st.claimed_hours, 0) + due)) * v_yield, 4);
      IF v_tail > 0 THEN
        v_tref := 'mine:'||p_map||':'||p_q||':'||p_r||':'||extract(epoch FROM v_from)::bigint||':tail';
      ELSE
        v_tail := 0;
      END IF;
    END IF;
  ELSE
    -- Прежние шахты и грибы: выход клетки, предел maxHours (жизнь гриба).
    v_res := cfg->>'resource'; v_tok := cfg->>'token';
    v_yield := COALESCE((cfg->>'yield')::numeric, 0);
    v_from := COALESCE(st.accrue_from, st.captured_at);
    hrs := extract(epoch FROM (now() - v_from)) / 3600.0;
    IF (cfg->>'maxHours') IS NOT NULL THEN hrs := LEAST(hrs, (cfg->>'maxHours')::numeric); END IF;
    IF v_res IS NOT NULL AND v_yield > 0 THEN
      due := floor(hrs - COALESCE(st.claimed_hours, 0));
      IF due > 0 THEN amt := round(due * v_yield, 4); ELSE due := 0; END IF;
    END IF;
    hrs := GREATEST(hrs, 0);
  END IF;
  IF due > 0 THEN
    -- Тот же ключ, что у прежних выплат: по нему «Забрать» идемпотентно в леджерах.
    v_ref := 'mine:'||p_map||':'||p_q||':'||p_r||':'||extract(epoch FROM v_from)::bigint
             ||':'||v_tag||(COALESCE(st.claimed_hours, 0) + due)::text;
  END IF;
  INSERT INTO yuplink.raid_mine_capture_log
    (map_id, q, r, old_account, old_wallet, new_account, resource, token, yield,
     hours, due_hours, amount, ref, old_captured_at, kind, tail, tail_ref, notified_at)
  VALUES
    (p_map, p_q, p_r, st.owner_account, st.owner_wallet, p_new, v_res, v_tok, v_yield,
     round(hrs, 4), due, amt, v_ref, st.captured_at, p_kind, v_tail, v_tref,
     -- Остров игрок закрывает сам — письма не нужно.
     CASE WHEN p_kind = 'island' THEN now() END)
  ON CONFLICT (map_id, q, r, old_captured_at) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_capture_v2(p_map text, p_q integer, p_r integer, p_account text, p_wallet text, p_cfg jsonb)
 RETURNS text
 LANGUAGE plpgsql
AS $fn$
DECLARE st yuplink.raid_mine_state;
BEGIN
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF NOT FOUND THEN RAISE EXCEPTION 'mine_broken'; END IF;
  IF now() >= yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at) THEN
    RAISE EXCEPTION 'mine_broken';
  END IF;
  IF st.owner_account = p_account THEN RETURN st.owner_account; END IF;
  -- Несобранные целые часы прежнего — строкой журнала к «Забрать», не на счёт.
  PERFORM yuplink.raid_mine_lose(p_map, p_q, p_r, 'capture', p_account);
  UPDATE yuplink.raid_mine_state
     SET owner_account = p_account, owner_wallet = p_wallet, captured_at = now(),
         accrue_from = yuplink.raid_mine_v2_start(p_map, p_q, p_r, GREATEST(now(), st.accrue_from)),
         claimed_hours = 0
   WHERE map_id=p_map AND q=p_q AND r=p_r;
  RETURN st.owner_account;
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_capture(p_map text, p_q integer, p_r integer, p_account text, p_wallet text)
 RETURNS text
 LANGUAGE plpgsql
AS $fn$
DECLARE st record; v_old text; v2cfg jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mine:'||p_map||':'||p_q||':'||p_r));
  -- Шахты v2 (§8.59): вид клетки v2 и строки нет (сломана, ничья) или она уже
  -- на v2 (accrue_from задан) — своя ветка. Ниже — прежний захват.
  SELECT building_config INTO v2cfg FROM yuplink.raid_map_cells WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF yuplink.raid_mine_v2_std(v2cfg) IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM yuplink.raid_mine_state x
        WHERE x.map_id=p_map AND x.q=p_q AND x.r=p_r AND x.accrue_from IS NULL) THEN
    RETURN yuplink.raid_mine_capture_v2(p_map, p_q, p_r, p_account, p_wallet, v2cfg);
  END IF;
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF FOUND THEN
    v_old := st.owner_account;
    -- Своя шахта — ничего не трогаем (двойной тап, ретрай моста).
    IF st.owner_account = p_account THEN RETURN v_old; END IF;
    -- Журнал — при КАЖДОЙ смене владельца, даже без накопленного. Гриб
    -- (raid_dmine_take зовёт этот захват) — «подняли».
    PERFORM yuplink.raid_mine_lose(p_map, p_q, p_r,
      CASE WHEN yuplink.raid_mushroom_kind(v2cfg) IS NOT NULL THEN 'take' ELSE 'capture' END,
      p_account);
  END IF;
  INSERT INTO yuplink.raid_mine_state(map_id,q,r,owner_account,owner_wallet,captured_at,claimed_hours)
    VALUES(p_map,p_q,p_r,p_account,p_wallet,now(),0)
    ON CONFLICT (map_id,q,r) DO UPDATE SET
      owner_account=p_account, owner_wallet=p_wallet, captured_at=now(), claimed_hours=0,
      -- Клетка была v2, админ сменил вид: отрезок нового хозяина — с этой минуты.
      accrue_from=CASE WHEN yuplink.raid_mine_state.accrue_from IS NOT NULL THEN now() END;
  RETURN v_old;
END $fn$;

-- Поломка: amount — начислено СЕЙЧАС, то есть 0 (несобранное ждёт в журнале);
-- обход, починка и разборка кладут его в ачивку — ачивка теперь при «Забрать».
CREATE OR REPLACE FUNCTION yuplink.raid_mine_break(p_map text, p_q integer, p_r integer, OUT broke boolean, OUT owner text, OUT amount numeric)
 RETURNS record
 LANGUAGE plpgsql
AS $fn$
DECLARE st yuplink.raid_mine_state; cfg jsonb;
BEGIN
  broke := false; owner := NULL; amount := 0;
  PERFORM pg_advisory_xact_lock(hashtext('mine:'||p_map||':'||p_q||':'||p_r));
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF NOT FOUND OR st.accrue_from IS NULL THEN RETURN; END IF;
  SELECT building_config INTO cfg FROM yuplink.raid_map_cells WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF yuplink.raid_mine_v2_std(cfg) IS NULL THEN RETURN; END IF;
  IF now() < yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at) THEN RETURN; END IF;
  -- Несобранное до поломки (§8.59 п. 4, 10: целые часы и неполный последний
  -- час) — прежнему хозяину строкой журнала к «Забрать».
  PERFORM yuplink.raid_mine_lose(p_map, p_q, p_r, 'break', NULL);
  -- Охрана сбежала навсегда (§8.59 п. 5); охрану магического сундука не трогаем.
  DELETE FROM yuplink.raid_mine_guard g
   WHERE g.map_id=p_map AND g.q=p_q AND g.r=p_r
     AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc
                      WHERE mc.map_id=p_map AND mc.q=p_q AND mc.r=p_r);
  DELETE FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  broke := true; owner := st.owner_account;
END $fn$;

-- Конец жизни гриба: хозяину целые часы до конца жизни — строкой 'expire'.
CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_expire_cell(p_map text, p_q integer, p_r integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
  c       record;
  v_owner text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('godmove:' || p_map));
  PERFORM pg_advisory_xact_lock(hashtext('chestcell:' || p_map || ':' || p_q || ':' || p_r));
  PERFORM pg_advisory_xact_lock(hashtext('mine:' || p_map || ':' || p_q || ':' || p_r));
  SELECT cc.building_id, cc.building_config, cc.group_id INTO c
    FROM yuplink.raid_map_cells cc
   WHERE cc.map_id = p_map AND cc.q = p_q AND cc.r = p_r
     FOR UPDATE;
  IF NOT FOUND OR c.building_id IS NULL OR NOT (c.building_config ? 'diesAt')
     OR yuplink.raid_mushroom_kind(c.building_config) IS NULL
     OR (c.building_config->>'diesAt')::timestamptz > now() THEN
    RETURN NULL;
  END IF;
  SELECT s.owner_account INTO v_owner FROM yuplink.raid_mine_state s
   WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r;
  IF v_owner IS NOT NULL THEN
    -- maxHours клетки — целые часы до конца жизни: больше не насчитает.
    PERFORM yuplink.raid_mine_lose(p_map, p_q, p_r, 'expire', NULL);
    DELETE FROM yuplink.raid_mine_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  END IF;
  DELETE FROM yuplink.beta_raid_building_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  DELETE FROM yuplink.raid_mine_guard WHERE map_id = p_map AND q = p_q AND r = p_r;
  UPDATE yuplink.raid_map_cells
     SET building_id = NULL, building_config = NULL, building_skin_id = NULL, saved_at = now()
   WHERE map_id = p_map AND q = p_q AND r = p_r;
  IF c.group_id IS NOT NULL THEN
    UPDATE yuplink.raid_map_cells
       SET group_id = NULL, icon_scale = NULL, saved_at = now()
     WHERE map_id = p_map AND group_id = c.group_id;
  END IF;
  UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = p_map;
  UPDATE yuplink.raid_dmine SET state = 'gone', lifted_at = now()
   WHERE state = 'placed' AND lifted_at IS NULL
     AND placed_map = p_map AND placed_q = p_q AND placed_r = p_r;
  -- paid — начислено сейчас: 0, накопленное ждёт «Забрать».
  RETURN jsonb_build_object('owner', v_owner, 'paid', 0, 'block', c.group_id IS NOT NULL);
END $fn$;

-- Разборка (§8.70): тело с прода (minev2-60), разница — строка поломки,
-- случившейся внутри разборки, получает вид 'dismantle' («разобрали»);
-- credited/credited_to в итоге — 0/NULL: накопленное ждёт «Забрать».
CREATE OR REPLACE FUNCTION yuplink.raid_mine_dismantle(p_op text, p_map text, p_q integer, p_r integer, p_account text, p_cost numeric, p_items jsonb, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
  c      record;
  b      record;
  v_prev jsonb;
  v_bag  text := 'lb_' || md5('mdis:' || COALESCE(p_op, ''));
  v_n    integer := 0;
  v_res  jsonb;
  v_cap  timestamptz;
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

  IF jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
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
      FROM jsonb_to_recordset(p_items)
           AS v(k text, kind text, ref text, name text, image text, n numeric, h integer)
      LEFT JOIN yuplink.raid_custom_item ci ON v.kind = 'custom' AND ci.id = v.ref
     WHERE v.n > 0 AND v.h > 0 AND (v.kind <> 'custom' OR ci.id IS NOT NULL)
    ON CONFLICT (bag_id, stack_key, expires_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN DELETE FROM yuplink.raid_loot_bag WHERE id = v_bag; END IF;
  END IF;

  v_res := jsonb_build_object(
    'bag', CASE WHEN v_n > 0 THEN v_bag END,
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

-- Снос острова (island-mine-claim): несобранное — строкой 'island', владение снято.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_island_release(p_map text, p_q integer, p_r integer)
 RETURNS text
 LANGUAGE plpgsql
AS $fn$
DECLARE v_id text;
BEGIN
  IF left(COALESCE(p_map, ''), 5) <> 'isle_' THEN RAISE EXCEPTION 'island.not_island'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mine:'||p_map||':'||p_q||':'||p_r));
  v_id := yuplink.raid_mine_lose(p_map, p_q, p_r, 'island', NULL);
  DELETE FROM yuplink.raid_mine_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  RETURN v_id;
END $fn$;

-- «Забрать»: своя строка, под локом строки, тем же ключом; повтор — was.
-- Кошелёк — того, кто жмёт (сервер проверил: он этого аккаунта), а не прежний
-- хозяйский: энергия идёт на acc_of(кошелька), и отвязанный с тех пор кошелёк
-- увёл бы её в никуда или на чужой аккаунт.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_lost_claim(p_id text, p_account text, p_wallet text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE l yuplink.raid_mine_capture_log;
BEGIN
  IF COALESCE(p_account, '') = '' THEN RAISE EXCEPTION 'mine_lost_gone'; END IF;
  SELECT * INTO l FROM yuplink.raid_mine_capture_log WHERE id = p_id FOR UPDATE;
  -- Чужая и несуществующая — один ответ: чужие строки не угадать.
  IF NOT FOUND OR l.old_account IS DISTINCT FROM p_account THEN RAISE EXCEPTION 'mine_lost_gone'; END IF;
  IF l.claimed_at IS NOT NULL THEN
    UPDATE yuplink.raid_mine_capture_log
       SET seen_at = COALESCE(seen_at, now()), notified_at = COALESCE(notified_at, now())
     WHERE id = p_id AND (seen_at IS NULL OR notified_at IS NULL);
    RETURN jsonb_build_object('was', true, 'amount', 0, 'resource', l.resource, 'token', l.token);
  END IF;
  IF l.amount > 0 AND l.ref IS NOT NULL THEN
    PERFORM yuplink.raid_mine_credit(l.old_account, COALESCE(NULLIF(p_wallet, ''), l.old_wallet),
                                     l.resource, l.token, l.amount, l.ref);
  END IF;
  IF l.tail > 0 AND l.tail_ref IS NOT NULL THEN
    PERFORM yuplink.raid_mine_credit(l.old_account, COALESCE(NULLIF(p_wallet, ''), l.old_wallet),
                                     l.resource, l.token, l.tail, l.tail_ref);
  END IF;
  UPDATE yuplink.raid_mine_capture_log
     SET claimed_at = now(), seen_at = COALESCE(seen_at, now()), notified_at = COALESCE(notified_at, now())
   WHERE id = p_id;
  RETURN jsonb_build_object('was', false, 'amount', l.amount + l.tail,
                            'resource', l.resource, 'token', l.token);
END $fn$;

-- Письма и тосты: незабранные, неуведомлённые за сутки; игроку, которому
-- писали меньше минуты назад, — в следующий обход (одно письмо на пачку).
CREATE OR REPLACE FUNCTION yuplink.raid_mine_lost_due(p_limit integer)
 RETURNS TABLE(n_id text, n_account text, n_kind text, n_q integer, n_r integer,
               n_resource text, n_token text, n_amount numeric, n_hours numeric)
 LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('minelost:notify')) THEN RETURN; END IF;
  RETURN QUERY
  WITH due AS (
    SELECT l.id FROM yuplink.raid_mine_capture_log l
     WHERE l.notified_at IS NULL AND l.claimed_at IS NULL AND l.old_account IS NOT NULL
       AND l.seized_at > now() - interval '1 day'
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_capture_log x
                        WHERE x.old_account = l.old_account
                          AND x.notified_at > now() - interval '60 seconds')
     ORDER BY l.seized_at
     LIMIT GREATEST(COALESCE(p_limit, 0), 0)
     FOR UPDATE OF l SKIP LOCKED
  )
  UPDATE yuplink.raid_mine_capture_log u SET notified_at = now()
    FROM due WHERE u.id = due.id
  RETURNING u.id, u.old_account, u.kind, u.q, u.r, u.resource, u.token, u.amount + u.tail,
            u.due_hours + CASE WHEN u.tail > 0 AND u.yield > 0 THEN u.tail / u.yield ELSE 0 END;
END $fn$;

-- Новый отрезок v2: эпоха не совпадает с хвостом, ждущим в журнале.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_start(p_map text, p_q integer, p_r integer, p_from timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
AS $fn$
DECLARE v timestamptz := p_from; k text;
BEGIN
  LOOP
    k := 'mine:'||p_map||':'||p_q||':'||p_r||':'||extract(epoch FROM v)::bigint||':tail';
    EXIT WHEN NOT EXISTS (SELECT 1 FROM yuplink.res_ledger l WHERE l.kind = 'mine' AND l.ref = k)
          AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_capture_log c WHERE c.tail_ref = k);
    v := v + interval '1 second';
  END LOOP;
  RETURN v;
END $fn$;

COMMIT;
