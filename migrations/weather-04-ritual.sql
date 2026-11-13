-- Обряд шамана (владелец, 28.10.2026): шаман из хижины тратится и даёт +3 % тому, что
-- выбрал игрок, — уровню погоды (из тех, что могут выпасть) или температуре (теплее /
-- холоднее) — на ближайшую смену погоды этого мира. Голос за другое забирает обратно:
-- каждый голос берёт свои 3 % у остальных исходов пропорционально их долям; выше 90 %
-- голоса ни один исход не поднимают (шанс админа выше 90 не опускают). С аккаунта — один
-- обряд за смену во всех мирах.
-- Зеркало src/lib/raid/weatherRitual.ts (applyVotes) — weather-04-migration.test сверяет.
--
-- 1. raid_weather_vote — голоса: слот, во время которого проведён обряд (он решает
--    СЛЕДУЮЩУЮ смену), аккаунт (один на слот), мир, за что.
-- 2. Распределения следующей смены — jsonb [{v, p}] в порядке броска weather-03
--    (без голосов бросок тот же самый): raid_weather_level_dist / _temp_dist / _pick.
-- 3. raid_weather_apply_votes — голоса поверх распределения.
-- 4. raid_weather_ensure — как в weather-03, но строка прошлого слота берётся FOR UPDATE и
--    распределения учитывают голоса этого слота (обряд держит ту же строку — голос
--    не теряется на стыке смены).
-- 5. raid_weather_ritual(аккаунт, мир, за что, op) — провести обряд: 'ok' или код отказа.
-- СТРОГО ПОСЛЕ weather-03 и shaman-01 (castle_shaman_take). Одной транзакцией: psql -1.
-- Повтор файла безвреден, но после weather-05 (обряд в каждом мире) — сразу повторить и его.
SET LOCAL lock_timeout = '5s';

-- ── 1. Голоса.
CREATE TABLE IF NOT EXISTS yuplink.raid_weather_vote (
  slot_at    timestamptz NOT NULL,
  account_id text NOT NULL,
  map_id     text NOT NULL REFERENCES yuplink.raid_maps(id) ON DELETE CASCADE,
  target     text NOT NULL CHECK (target IN ('clear', 'overcast', 'storm', 'warmer', 'colder')),
  op_id      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (slot_at, account_id)
);
CREATE INDEX IF NOT EXISTS raid_weather_vote_map_slot ON yuplink.raid_weather_vote (map_id, slot_at);
-- Повтор того же нажатия узнаётся и после смены слота (ответ потерялся на стыке).
CREATE UNIQUE INDEX IF NOT EXISTS raid_weather_vote_op ON yuplink.raid_weather_vote (account_id, op_id);

-- ── 2. Распределения (веса как в weather-03; без голосов бросок не меняется).
CREATE OR REPLACE FUNCTION yuplink.raid_weather_level_dist(p_prev text, p_odds jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT CASE
    WHEN p_prev = 'clear' THEN jsonb_build_array(
      jsonb_build_object('v', 'overcast', 'p', (p_odds ->> 'clearToOvercast')::numeric),
      jsonb_build_object('v', 'clear', 'p', 100 - (p_odds ->> 'clearToOvercast')::numeric))
    WHEN p_prev = 'storm' THEN jsonb_build_array(
      jsonb_build_object('v', 'overcast', 'p', (p_odds ->> 'stormToOvercast')::numeric),
      jsonb_build_object('v', 'storm', 'p', 100 - (p_odds ->> 'stormToOvercast')::numeric))
    ELSE jsonb_build_array(
      jsonb_build_object('v', 'clear', 'p', (p_odds ->> 'overcastToClear')::numeric),
      jsonb_build_object('v', 'storm', 'p', (p_odds ->> 'overcastToStorm')::numeric),
      jsonb_build_object('v', 'overcast', 'p', 100 - (p_odds ->> 'overcastToClear')::numeric
                                                   - (p_odds ->> 'overcastToStorm')::numeric))
  END
$fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_weather_temp_base(p_temp int)
RETURNS int
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT least(40, greatest(-40, floor((p_temp + 5) / 10.0)::int * 10))
$fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_weather_temp_dist(p_prev int, p_odds jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
AS $fn$
DECLARE
  v_base int := yuplink.raid_weather_temp_base(p_prev);
  v_down numeric := (p_odds ->> 'tempDown')::numeric;
  v_up   numeric := (p_odds ->> 'tempUp')::numeric;
  v_out  jsonb := '[]'::jsonb;
  v_sum  numeric := 0;
  d      int;
  w      numeric;
BEGIN
  FOREACH d IN ARRAY ARRAY[-10, 0, 10] LOOP
    IF v_base + d BETWEEN -40 AND 40 THEN
      w := CASE d WHEN -10 THEN v_down WHEN 10 THEN v_up ELSE 100 - v_down - v_up END;
      v_out := v_out || jsonb_build_array(jsonb_build_object('v', v_base + d, 'p', w));
      v_sum := v_sum + w;
    END IF;
  END LOOP;
  IF v_sum <= 0 THEN
    RETURN jsonb_build_array(jsonb_build_object('v', v_base, 'p', 100));
  END IF;
  RETURN v_out;
END $fn$;

-- Бросок по распределению: rnd ∈ [0, 1), порядок — как в списке, нулевые не выпадают.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_pick(p_dist jsonb, p_rnd double precision)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
AS $fn$
DECLARE
  v_sum  numeric := 0;
  v_acc  numeric := 0;
  v_last jsonb;
  e      jsonb;
BEGIN
  FOR e IN SELECT x FROM jsonb_array_elements(p_dist) x LOOP
    v_sum := v_sum + (e ->> 'p')::numeric;
  END LOOP;
  FOR e IN SELECT x FROM jsonb_array_elements(p_dist) x LOOP
    v_acc := v_acc + (e ->> 'p')::numeric;
    IF (e ->> 'p')::numeric > 0 THEN
      v_last := e -> 'v';
      IF p_rnd * v_sum < v_acc THEN
        RETURN e -> 'v';
      END IF;
    END IF;
  END LOOP;
  RETURN COALESCE(v_last, p_dist -> -1 -> 'v');
END $fn$;

-- ── 3. Голоса поверх распределения: p_votes {"<значение исхода>": голосов}.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_apply_votes(p_dist jsonb, p_votes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
AS $fn$
DECLARE
  n      int := jsonb_array_length(p_dist);
  vals   jsonb[] := ARRAY(SELECT e -> 'v' FROM jsonb_array_elements(p_dist) e);
  ws     numeric[] := ARRAY(SELECT (e ->> 'p')::numeric FROM jsonb_array_elements(p_dist) e);
  vs     numeric[];
  base   numeric[];
  q      numeric[];
  v_sum  numeric := 0;
  v_tot  numeric := 0;
  d      numeric;
  top    int := 0;
  extra  numeric;
  oth    numeric := 0;
  v_bo   numeric := 0;
  i      int;
  j      int;
  v_out  jsonb := '[]'::jsonb;
BEGIN
  IF n = 0 OR p_votes IS NULL THEN
    RETURN p_dist;
  END IF;
  vs := ARRAY(SELECT greatest(0, COALESCE((p_votes ->> (CASE WHEN jsonb_typeof(v) = 'string'
                                                              THEN v #>> '{}' ELSE v::text END))::numeric, 0))
                FROM unnest(vals) v);
  IF (SELECT sum(s) FROM unnest(vs) s) = 0 THEN
    RETURN p_dist;
  END IF;
  FOR i IN 1..n LOOP v_sum := v_sum + ws[i]; END LOOP;
  base := ARRAY(SELECT CASE WHEN v_sum > 0 THEN w / v_sum * 100 ELSE 100.0 / n END FROM unnest(ws) w);
  q := base;
  FOR i IN 1..n LOOP
    d := 3 * vs[i];
    FOR j IN 1..n LOOP
      IF j <> i AND vs[j] > 0 AND base[j] < 100 THEN
        d := d - 3 * vs[j] * base[i] / (100 - base[j]);
      END IF;
    END LOOP;
    q[i] := least(100, greatest(0, base[i] + d));
    v_tot := v_tot + q[i];
  END LOOP;
  IF v_tot > 0 THEN
    FOR i IN 1..n LOOP q[i] := q[i] / v_tot * 100; END LOOP;
  ELSE
    q := base;
  END IF;
  -- Потолок 90 %, но не ниже шанса админа без голосов (голоса не опускают свой же исход).
  FOR i IN 1..n LOOP
    IF top = 0 AND q[i] > greatest(90, base[i]) THEN top := i; END IF;
  END LOOP;
  IF top > 0 THEN
    extra := q[top] - greatest(90, base[top]);
    FOR i IN 1..n LOOP
      IF i <> top THEN oth := oth + q[i]; v_bo := v_bo + base[i]; END IF;
    END LOOP;
    FOR i IN 1..n LOOP
      IF i = top THEN
        q[i] := greatest(90, base[i]);
      ELSIF oth > 0 THEN
        q[i] := q[i] + extra * q[i] / oth;
      ELSIF v_bo > 0 THEN
        q[i] := q[i] + extra * base[i] / v_bo;
      ELSE
        q[i] := q[i] + extra / (n - 1);
      END IF;
    END LOOP;
  END IF;
  FOR i IN 1..n LOOP
    v_out := v_out || jsonb_build_array(jsonb_build_object('v', vals[i], 'p', q[i]));
  END LOOP;
  RETURN v_out;
END $fn$;

-- Голоса слота мира: {"clear": n, …, "warmer": n, "colder": n}.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_votes(p_map text, p_slot timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(jsonb_object_agg(t.target, t.n), '{}'::jsonb)
    FROM (SELECT v.target, count(*) AS n FROM yuplink.raid_weather_vote v
           WHERE v.map_id = p_map AND v.slot_at = p_slot GROUP BY v.target) t
$fn$;

-- Голоса уровня и температуры в ключах распределений.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_temp_votes(p_prev int, p_votes jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    (yuplink.raid_weather_temp_base(p_prev) + 10)::text, p_votes -> 'warmer',
    (yuplink.raid_weather_temp_base(p_prev) - 10)::text, p_votes -> 'colder'))
$fn$;

-- ── 4. Слот карты: как в weather-03, плюс FOR UPDATE и голоса.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_ensure(p_map text, p_at timestamptz DEFAULT now())
RETURNS yuplink.raid_weather
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_slot  timestamptz := yuplink.raid_weather_slot(COALESCE(p_at, now()));
  v_row   yuplink.raid_weather;
  v_at    timestamptz;
  v_t     int;
  v_lvl   text;
  v_kind  text;
  v_fx    boolean;
  v_odds  jsonb;
  v_votes jsonb;
BEGIN
  IF p_map IS NULL OR left(p_map, 5) = 'isle_'
     OR EXISTS (SELECT 1 FROM yuplink.raid_island i WHERE i.map_id = p_map)
     OR NOT EXISTS (SELECT 1 FROM yuplink.raid_maps m WHERE m.id = p_map) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row FROM yuplink.raid_weather w WHERE w.map_id = p_map AND w.slot_at = v_slot;
  IF FOUND THEN
    RETURN v_row;
  END IF;
  -- Прошлое не дописываем: позже этого слота уже есть погода — его нет и не будет.
  IF EXISTS (SELECT 1 FROM yuplink.raid_weather w WHERE w.map_id = p_map AND w.slot_at > v_slot) THEN
    RETURN NULL;
  END IF;

  -- Последний известный слот — от него цепочка; FOR UPDATE: обряд этого слота дописан до броска.
  SELECT * INTO v_row FROM yuplink.raid_weather w
   WHERE w.map_id = p_map AND w.slot_at < v_slot
   ORDER BY w.slot_at DESC
   LIMIT 1
   FOR UPDATE;
  -- Пока ждали замок, другой процесс мог уже бросить этот слот.
  IF v_row.map_id IS NOT NULL THEN
    PERFORM 1 FROM yuplink.raid_weather w WHERE w.map_id = p_map AND w.slot_at = v_slot;
    IF FOUND THEN
      SELECT * INTO v_row FROM yuplink.raid_weather w WHERE w.map_id = p_map AND w.slot_at = v_slot;
      RETURN v_row;
    END IF;
  END IF;
  v_at := CASE WHEN v_row.map_id IS NULL THEN v_slot ELSE v_row.slot_at + interval '3 hours' END;
  -- Влияние нового слота — флаг сейчас; включили или выключили посреди слота — со следующего.
  v_fx := EXISTS (SELECT 1 FROM yuplink.settings s
                   WHERE s.key = 'weather_effects' AND btrim(s.value, ' "') = 'on');
  v_odds := yuplink.raid_weather_odds();

  WHILE v_at <= v_slot LOOP
    IF v_row.map_id IS NULL THEN
      v_t := (least(8, floor(random() * 9)::int) - 4) * 10;
      v_lvl := (ARRAY['clear', 'overcast', 'storm'])[1 + least(2, floor(random() * 3)::int)];
      v_kind := yuplink.raid_weather_kind_for(v_lvl, v_t, random());
    ELSE
      v_votes := yuplink.raid_weather_votes(p_map, v_row.slot_at);
      v_t := (yuplink.raid_weather_pick(yuplink.raid_weather_apply_votes(
               yuplink.raid_weather_temp_dist(v_row.temp_c, v_odds),
               yuplink.raid_weather_temp_votes(v_row.temp_c, v_votes)), random()) #>> '{}')::int;
      v_lvl := yuplink.raid_weather_pick(yuplink.raid_weather_apply_votes(
                 yuplink.raid_weather_level_dist(v_row.level, v_odds), v_votes), random()) #>> '{}';
      v_kind := yuplink.raid_weather_next_kind(v_row.level, v_row.kind, v_lvl, v_t, random());
    END IF;
    -- Слот уже кончился (дописан задним числом) — без влияния: прошлое неизменно.
    INSERT INTO yuplink.raid_weather (map_id, slot_at, temp_c, level, kind, fx)
    VALUES (p_map, v_at, v_t, v_lvl, v_kind, v_fx AND v_at + interval '3 hours' > now())
    ON CONFLICT (map_id, slot_at) DO NOTHING;
    -- Лёг чужой бросок (другой процесс успел раньше) — цепочка дальше от него.
    SELECT * INTO v_row FROM yuplink.raid_weather w WHERE w.map_id = p_map AND w.slot_at = v_at;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    v_at := v_at + interval '3 hours';
  END LOOP;
  RETURN v_row;
END $fn$;

-- ── 5. Обряд: 'ok' | 'bad_target' | 'no_weather' | 'too_late' | 'cannot' | 'already' | 'no_shaman'.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_ritual(p_acc text, p_map text, p_target text, p_op text)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_slot timestamptz := yuplink.raid_weather_slot(now());
  v_row  yuplink.raid_weather;
  v_base int;
  v_prev yuplink.raid_weather_vote;
BEGIN
  IF p_target NOT IN ('clear', 'overcast', 'storm', 'warmer', 'colder') THEN
    RETURN 'bad_target';
  END IF;
  -- Один аккаунт — по очереди: двойной клик не потратит двух шаманов.
  PERFORM pg_advisory_xact_lock(hashtext('wx-ritual:' || p_acc));
  -- Повтор того же нажатия (в любом слоте) — «ok», второго шамана не берём.
  IF EXISTS (SELECT 1 FROM yuplink.raid_weather_vote v WHERE v.account_id = p_acc AND v.op_id = p_op) THEN
    RETURN 'ok';
  END IF;
  SELECT * INTO v_prev FROM yuplink.raid_weather_vote v WHERE v.slot_at = v_slot AND v.account_id = p_acc;
  IF FOUND THEN
    RETURN 'already';
  END IF;

  PERFORM yuplink.raid_weather_ensure(p_map, now());
  -- Та же строка, что держит бросок следующей смены: голос не теряется на стыке.
  SELECT * INTO v_row FROM yuplink.raid_weather w
   WHERE w.map_id = p_map AND w.slot_at = v_slot
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'no_weather';
  END IF;
  IF EXISTS (SELECT 1 FROM yuplink.raid_weather w WHERE w.map_id = p_map AND w.slot_at > v_slot) THEN
    RETURN 'too_late';
  END IF;

  v_base := yuplink.raid_weather_temp_base(v_row.temp_c);
  IF (p_target = 'warmer' AND v_base + 10 > 40)
     OR (p_target = 'colder' AND v_base - 10 < -40)
     OR (p_target IN ('clear', 'overcast', 'storm')
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
               yuplink.raid_weather_level_dist(v_row.level, yuplink.raid_weather_odds())) x
              WHERE x ->> 'v' = p_target)) THEN
    RETURN 'cannot';
  END IF;

  IF NOT yuplink.castle_shaman_take(p_acc) THEN
    RETURN 'no_shaman';
  END IF;
  INSERT INTO yuplink.raid_weather_vote (slot_at, account_id, map_id, target, op_id)
  VALUES (v_slot, p_acc, p_map, p_target, p_op);
  RETURN 'ok';
END $fn$;
