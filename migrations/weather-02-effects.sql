-- Погода в экономике (владелец, 26.10.2026): добыча шахт v2 × коэффициент «шахты»,
-- урожай полей × коэффициент «фермы». Коэффициент даёт yuplink.raid_weather_coef
-- (migrations/weather-01.sql): остров, нет строки слота, у слота fx = false (влияние
-- не было включено, когда слот создавался) — 1. СТРОГО ПОСЛЕ weather-01 и ДО КОДА (код зовёт raid_mine_weather_slots
-- и raid_field_weather_dsec). Повтор файла безвреден.
--
-- 1. Шахты v2 (лесопилка, каменоломня, золотая, алмазная; raid_mine_state с accrue_from).
--    Каждый полный час отрезка — выход × коэффициент слота, где этот час начался;
--    «только полные часы» — как было. Счёт — через Σ(коэф − 1) по часам
--    (raid_mine_weather_delta): выплата = round((часы + Σ(коэф − 1)) × ставка, 4).
--    Ставка, ключи начисления, claimed_hours — прежние: повтор не задваивает, а
--    при коэффициенте 1 Σ = 0 (целый 0) и каждое число — ровно прежнее.
--    Выплаты дробные (до 0,0001), поэтому доли не теряются: 1 золото/ч × 0,85 при
--    сборе каждый час — 0,85 каждый раз. Неполный час (смена режима, починка,
--    улучшение, окружение, поломка, понижение уровня синим) — × коэффициент слота,
--    где он начался.
--    Пути: сбор (raid_mine_claim → raid_mine_v2_settle; «Добыча» и «Управление
--    шахтами»), закрытие отрезка (raid_mine_v2_close: режим, починка, улучшение,
--    окружение), потеря (raid_mine_lose: захват, поломка, разборка, остров), синий
--    динамит (raid_dynamite_blue_mine), показ (raid_mine_pending и
--    raid_mine_weather_slots — слоты для живого счёта у клиента).
--    НЕ трогаем: грибы (raid_dmine), шахты старого образца (энергия, пыль, DARAI,
--    лесопилки острова с maxHours) — их ветки raid_mine_claim / raid_mine_lose прежние.
-- 2. Поля: отрезок since…now у работника копит (секунды × коэффициент «фермы» своего
--    слота) / 3600 × доля (raid_field_weather_dsec = Σ(коэф − 1) × секунды по слотам).
--    accrued дробный, take забирает целые — доли не теряются, как и раньше.
--
-- Тела функций — с прода (pg_get_functiondef 26.10.2026), правки — только строки с
-- пометкой «Погода (weather-02)».
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Σ(коэф − 1) по часам p_from + p_h0 … p_from + p_h0 + p_n − 1 (каждый час — по слоту,
-- где он начался). Все коэффициенты 1 — ровно 0 (целый), счёт не меняется.
CREATE OR REPLACE FUNCTION yuplink.raid_mine_weather_delta(p_map text, p_from timestamptz,
                                                            p_h0 numeric, p_n numeric)
RETURNS numeric
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(sum(c.k - 1) FILTER (WHERE c.k <> 1), 0)
    FROM generate_series(0, GREATEST(floor(COALESCE(p_n, 0)), 0)::int - 1) AS i
   CROSS JOIN LATERAL (
     SELECT yuplink.raid_weather_coef(p_map, p_from + make_interval(
              secs => ((COALESCE(p_h0, 0) + i) * 3600)::double precision), 'mine') AS k) c
$fn$;

-- Слоты погоды отрезка для живого счёта у клиента (lib/mineWeather.ts): [[начало слота,
-- мс; коэффициент «шахты»], …] от слота p_from до слота p_to; все 1 — NULL (счёт прежний).
CREATE OR REPLACE FUNCTION yuplink.raid_mine_weather_slots(p_map text, p_from timestamptz,
                                                            p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $fn$
  SELECT CASE WHEN bool_or(x.k <> 1)
              THEN jsonb_agg(jsonb_build_array((extract(epoch FROM x.g) * 1000)::bigint, x.k)
                             ORDER BY x.g) END
    FROM (SELECT g, yuplink.raid_weather_coef(p_map, g, 'mine') AS k
            FROM generate_series(yuplink.raid_weather_slot(p_from), GREATEST(p_to, p_from),
                                 interval '3 hours') AS g) x
$fn$;

-- Σ(коэф − 1) × секунды по слотам отрезка p_from…p_to (коэффициент «фермы»).
-- Все коэффициенты 1 — ровно 0 (целый), счёт не меняется.
CREATE OR REPLACE FUNCTION yuplink.raid_field_weather_dsec(p_map text, p_from timestamptz,
                                                            p_to timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(sum((x.k - 1) * extract(epoch FROM (LEAST(p_to, x.g + interval '3 hours')
                                                       - GREATEST(p_from, x.g))))
                    FILTER (WHERE x.k <> 1), 0)
    FROM (SELECT g, yuplink.raid_weather_coef(p_map, g, 'farm') AS k
            FROM generate_series(yuplink.raid_weather_slot(p_from), p_to, interval '3 hours') AS g
           WHERE g < p_to) x
   WHERE p_to > p_from
$fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_settle(p_st yuplink.raid_mine_state, p_cfg jsonb, p_tag text, OUT amount numeric, OUT due numeric, OUT ref text)
 RETURNS record
 LANGUAGE plpgsql
AS $fn$
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
  -- Погода (weather-02): каждый час × коэффициент шахт слота, где он начался.
  amount := round((due + yuplink.raid_mine_weather_delta(p_st.map_id, v_from,
                    COALESCE(p_st.claimed_hours, 0), due))
                  * v_std * yuplink.raid_mine_mode_mult(p_st.mode), 4);
  ref := 'mine:'||p_st.map_id||':'||p_st.q||':'||p_st.r||':'||extract(epoch FROM v_from)::bigint
         ||':'||COALESCE(p_tag, '')||(COALESCE(p_st.claimed_hours, 0) + due)::text;
  PERFORM yuplink.raid_mine_credit(p_st.owner_account, p_st.owner_wallet, p_cfg->>'resource', NULL, amount, ref);
  UPDATE yuplink.raid_mine_state SET claimed_hours = COALESCE(claimed_hours, 0) + due
   WHERE map_id = p_st.map_id AND q = p_st.q AND r = p_st.r;
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_mine_v2_close(p_st yuplink.raid_mine_state, p_cfg jsonb, OUT amount numeric, OUT tail numeric)
 RETURNS record
 LANGUAGE plpgsql
AS $fn$
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
          * v_std * yuplink.raid_mine_mode_mult(p_st.mode)
          -- Погода (weather-02): неполный час — по слоту, где он начался.
          * yuplink.raid_weather_coef(p_st.map_id, p_st.accrue_from + make_interval(
              secs => ((COALESCE(p_st.claimed_hours, 0) + s.due) * 3600)::double precision), 'mine'), 4);
  IF tail > 0 THEN
    PERFORM yuplink.raid_mine_credit(p_st.owner_account, p_st.owner_wallet, p_cfg->>'resource', NULL, tail,
      'mine:'||p_st.map_id||':'||p_st.q||':'||p_st.r||':'||extract(epoch FROM p_st.accrue_from)::bigint||':tail');
  ELSE
    tail := 0;
  END IF;
  amount := s.amount + tail;
END $fn$;

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
      -- Погода (weather-02): каждый час × коэффициент шахт слота, где он начался.
      amt := round((due + yuplink.raid_mine_weather_delta(p_map, v_from,
                     COALESCE(st.claimed_hours, 0), due)) * v_yield, 4);
    ELSE
      due := 0;
    END IF;
    -- Поломка: и неполный последний час, дробно, вниз (как raid_mine_v2_close);
    -- алмаз острова платится только сутками — без хвоста.
    IF p_kind = 'break' AND yuplink.raid_mine_v2_period(cfg) <= 1 THEN
      v_tail := trunc(GREATEST(0, hrs - (COALESCE(st.claimed_hours, 0) + due)) * v_yield
                      * yuplink.raid_weather_coef(p_map, v_from + make_interval(
                          secs => ((COALESCE(st.claimed_hours, 0) + due) * 3600)::double precision), 'mine'), 4);
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

CREATE OR REPLACE FUNCTION yuplink.raid_mine_pending(p_map text, p_q integer, p_r integer)
 RETURNS numeric
 LANGUAGE plpgsql
AS $fn$
DECLARE st record; cfg jsonb; v_yield numeric; h int; due int; v_std numeric; v_due numeric;
BEGIN
  SELECT * INTO st FROM yuplink.raid_mine_state WHERE map_id=p_map AND q=p_q AND r=p_r;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT building_config INTO cfg FROM yuplink.raid_map_cells WHERE map_id=p_map AND q=p_q AND r=p_r;
  -- Шахты v2 (§8.59): стандарт × режим, часы от начала отрезка до поломки.
  v_std := yuplink.raid_mine_v2_std(cfg);
  IF v_std IS NOT NULL AND st.accrue_from IS NOT NULL THEN
    v_due := yuplink.raid_mine_v2_hours(st.accrue_from,
             yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at), st.claimed_hours,
             yuplink.raid_mine_v2_period(cfg));
    -- Погода (weather-02): как raid_mine_v2_settle.
    RETURN round((v_due + yuplink.raid_mine_weather_delta(p_map, st.accrue_from,
                    COALESCE(st.claimed_hours, 0), v_due))
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
END; $fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_blue_mine(p_map text, p_q integer, p_r integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE
  c       record;
  st      yuplink.raid_mine_state;
  g       record;
  v_chest boolean;
  v_v2    boolean;
  v_lvl   integer;
  v_std   numeric;
  v_yield numeric;
  v_brk   timestamptz;
  v_hrs   numeric := 0;
  v_due   numeric := 0;
  v_amt   numeric := 0;
  v_tail  numeric := 0;
  v_key   text;
  v_base  jsonb;
BEGIN
  -- Локи клетки (mine:, chestcell:) и строку клетки берёт raid_dynamite_blast.
  SELECT cc.building_id, cc.building_config AS cfg, cc.building_skin_id AS skin, cc.group_id
    INTO c
    FROM yuplink.raid_map_cells cc
   WHERE cc.map_id = p_map AND cc.q = p_q AND cc.r = p_r
     FOR UPDATE;
  IF NOT FOUND OR NOT yuplink.raid_dynamite_is_mine(c.building_id, c.cfg) THEN RETURN NULL; END IF;
  v_base := jsonb_build_object('q', p_q, 'r', p_r, 'building', c.building_id, 'skin', c.skin,
                               'resource', c.cfg->>'resource', 'block', c.group_id IS NOT NULL);
  SELECT * INTO st FROM yuplink.raid_mine_state s WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r;

  -- 1) Грибы динамит не трогает (владелец, 25.10.2026: «ни один динамит не сносит грибы»).
  IF yuplink.raid_mushroom_kind(c.cfg) IS NOT NULL THEN RETURN NULL; END IF;

  -- 2) Охрана шахты: один синий — охраны нет, у алмазной тоже; шахта не тронута.
  --    Охрана магического сундука — не шахтная: её бьёт общий шаг (−10 %).
  v_chest := EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc
                      WHERE mc.map_id = p_map AND mc.q = p_q AND mc.r = p_r);
  IF NOT v_chest THEN
    SELECT gg.current_hp INTO g
      FROM yuplink.raid_mine_guard gg
     WHERE gg.map_id = p_map AND gg.q = p_q AND gg.r = p_r
       AND gg.killed_at IS NULL AND gg.current_hp > 0
       FOR UPDATE;
    IF FOUND THEN
      DELETE FROM yuplink.raid_mine_guard WHERE map_id = p_map AND q = p_q AND r = p_r;
      RETURN v_base || jsonb_build_object('act', 'guard', 'dealt', g.current_hp,
                                          'owner', st.owner_account);
    END IF;
  END IF;

  -- 3) Алмазная шахта неприкосновенна (только охрана — шаг 2).
  IF c.cfg->>'resource' = 'diamonds' THEN
    RETURN v_base || jsonb_build_object('act', 'immune');
  END IF;

  -- 4) Уже разрушена (жизнь кончилась или ничья после поломки) — взрывать нечего.
  v_v2 := yuplink.raid_mine_v2_std(c.cfg) IS NOT NULL;
  IF v_v2 AND yuplink.raid_dynamite_mine_dead(p_map, p_q, p_r) THEN
    RETURN v_base || jsonb_build_object('act', 'dead');
  END IF;

  -- 5) Уровень 2 и выше — минус уровень. Прошедшее по старому уровню (целые часы и
  --    неполный последний — как при поломке) — хозяину строкой «к сбору» в «Добычу»
  --    (владелец, 25.10.2026: «да» — не на баланс, §8.71), дальше счёт по новому с этой минуты.
  v_lvl := yuplink.raid_mine_level(c.cfg);
  IF v_v2 AND v_lvl >= 2 THEN
    IF st.owner_account IS NOT NULL AND st.accrue_from IS NOT NULL THEN
      v_std := yuplink.raid_mine_v2_std(c.cfg);
      v_yield := v_std * yuplink.raid_mine_mode_mult(st.mode);
      v_brk := yuplink.raid_mine_break_at(st.mode, st.life_left, st.life_at);
      v_hrs := GREATEST(extract(epoch FROM (LEAST(now(), v_brk) - st.accrue_from)) / 3600.0, 0);
      v_due := yuplink.raid_mine_v2_hours(st.accrue_from, v_brk, st.claimed_hours,
                                          yuplink.raid_mine_v2_period(c.cfg));
      -- Погода (weather-02): каждый час × коэффициент шахт слота, где он начался.
      IF v_due > 0 THEN
        v_amt := round((v_due + yuplink.raid_mine_weather_delta(p_map, st.accrue_from,
                          COALESCE(st.claimed_hours, 0), v_due)) * v_yield, 4);
      ELSE v_due := 0; END IF;
      IF yuplink.raid_mine_v2_period(c.cfg) <= 1 THEN
        v_tail := trunc(GREATEST(0, v_hrs - (COALESCE(st.claimed_hours, 0) + v_due)) * v_yield
                        * yuplink.raid_weather_coef(p_map, st.accrue_from + make_interval(
                            secs => ((COALESCE(st.claimed_hours, 0) + v_due) * 3600)::double precision), 'mine'), 4);
      END IF;
      v_key := 'mine:' || p_map || ':' || p_q || ':' || p_r || ':'
               || extract(epoch FROM st.accrue_from)::bigint;
      IF v_amt > 0 OR v_tail > 0 THEN
        INSERT INTO yuplink.raid_mine_capture_log
          (map_id, q, r, old_account, old_wallet, new_account, resource, token, yield,
           hours, due_hours, amount, ref, old_captured_at, kind, tail, tail_ref)
        VALUES
          (p_map, p_q, p_r, st.owner_account, st.owner_wallet, NULL, c.cfg->>'resource', NULL,
           v_yield, round(v_hrs, 4), v_due, v_amt,
           CASE WHEN v_due > 0 THEN v_key || ':' || (COALESCE(st.claimed_hours, 0) + v_due)::text END,
           clock_timestamp(), 'level', GREATEST(v_tail, 0),
           CASE WHEN v_tail > 0 THEN v_key || ':tail' END);
      END IF;
      UPDATE yuplink.raid_mine_state x
         SET claimed_hours = 0,
             accrue_from = yuplink.raid_mine_v2_start(p_map, p_q, p_r, GREATEST(now(), st.accrue_from))
       WHERE x.map_id = p_map AND x.q = p_q AND x.r = p_r;
    END IF;
    UPDATE yuplink.raid_map_cells cc
       SET building_config = jsonb_set(COALESCE(cc.building_config, '{}'::jsonb), '{mineLevel}',
                                       to_jsonb(v_lvl - 1)),
           saved_at = now()
     WHERE cc.map_id = p_map AND cc.q = p_q AND cc.r = p_r;
    UPDATE yuplink.raid_maps SET edit_seq = COALESCE(edit_seq, 0) + 1 WHERE id = p_map;
    RETURN v_base || jsonb_build_object('act', 'level', 'from', v_lvl, 'to', v_lvl - 1,
                                        'owner', st.owner_account, 'pending', v_amt + v_tail);
  END IF;

  -- 6) Первый уровень или шахта без уровней — разрушена: несобранное хозяину к «Забрать»
  --    (§8.71), хозяина нет. v2 — руины (поломка: raid_dynamite_mine_dead, берёт тот, кто
  --    починит); ничья v2 с жизнью — та же отметка поломки в журнале; прежняя шахта — ничья.
  IF st.owner_account IS NOT NULL THEN
    PERFORM yuplink.raid_mine_lose(p_map, p_q, p_r, 'break', NULL);
    DELETE FROM yuplink.raid_mine_state WHERE map_id = p_map AND q = p_q AND r = p_r;
  ELSIF v_v2 THEN
    INSERT INTO yuplink.raid_mine_capture_log
      (map_id, q, r, kind, old_captured_at, seen_at, claimed_at, notified_at)
    VALUES (p_map, p_q, p_r, 'break', clock_timestamp(), now(), now(), now())
    ON CONFLICT (map_id, q, r, old_captured_at) DO NOTHING;
  ELSE
    RETURN v_base || jsonb_build_object('act', 'none');
  END IF;
  DELETE FROM yuplink.raid_mine_guard WHERE map_id = p_map AND q = p_q AND r = p_r AND NOT v_chest;
  RETURN v_base || jsonb_build_object('act', 'broken', 'owner', st.owner_account, 'v2', v_v2);
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_field_settle(p_map text, p_q integer, p_r integer)
 RETURNS void
 LANGUAGE plpgsql
AS $fn$
DECLARE cfg jsonb; v_yield numeric; n int;
BEGIN
  SELECT building_config INTO cfg FROM yuplink.raid_map_cells
   WHERE map_id=p_map AND q=p_q AND r=p_r;
  v_yield := COALESCE((cfg->'field'->>'yield')::numeric, 0);
  SELECT count(*) INTO n FROM yuplink.raid_field_worker
   WHERE map_id=p_map AND q=p_q AND r=p_r AND hero_id IS NOT NULL;
  IF n > 0 AND v_yield > 0 THEN
    UPDATE yuplink.raid_field_worker
       SET accrued = accrued
             -- Погода (weather-02): секунды отрезка × коэффициент ферм своего слота.
             + GREATEST(extract(epoch FROM (now()-since))
                        + yuplink.raid_field_weather_dsec(p_map, since, now()), 0)/3600.0 * (v_yield / n),
           since = now()
     WHERE map_id=p_map AND q=p_q AND r=p_r AND hero_id IS NOT NULL;
  ELSE
    -- Поле стоит: время не капает никому, но отрезок всё равно закрываем.
    UPDATE yuplink.raid_field_worker SET since = now()
     WHERE map_id=p_map AND q=p_q AND r=p_r;
  END IF;
END; $fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_field_pending(p_map text, p_q integer, p_r integer, p_account text)
 RETURNS numeric
 LANGUAGE plpgsql
AS $fn$
DECLARE w record; cfg jsonb; v_yield numeric; n int; live numeric;
BEGIN
  SELECT * INTO w FROM yuplink.raid_field_worker
   WHERE map_id=p_map AND q=p_q AND r=p_r AND account_id=p_account;
  IF NOT FOUND THEN RETURN 0; END IF;
  live := w.accrued;
  IF w.hero_id IS NOT NULL THEN
    SELECT building_config INTO cfg FROM yuplink.raid_map_cells
     WHERE map_id=p_map AND q=p_q AND r=p_r;
    v_yield := COALESCE((cfg->'field'->>'yield')::numeric, 0);
    SELECT count(*) INTO n FROM yuplink.raid_field_worker
     WHERE map_id=p_map AND q=p_q AND r=p_r AND hero_id IS NOT NULL;
    IF n > 0 AND v_yield > 0 THEN
      -- Погода (weather-02): как raid_field_settle.
      live := live + GREATEST(extract(epoch FROM (now()-w.since))
                              + yuplink.raid_field_weather_dsec(p_map, w.since, now()), 0)/3600.0 * (v_yield / n);
    END IF;
  END IF;
  RETURN round(live, 6);
END; $fn$;

COMMIT;
