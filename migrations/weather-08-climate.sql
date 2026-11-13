-- Климат мира (владелец, 05.11.2026): «в некоторых мирах нужно реализовать ещё возможность
-- аномальной погоды и выставление шансов на более вероятную погоду и минимум и максимум по
-- погоде и по температурам. Аномалии −50/−60 или +50/+60: рыба не клюёт; фермы не работают;
-- шахты не работают; ход ×20; ход на воде ×20 … галка аномальных погод — и выбор жара или
-- холод … если идёт аномалия — метель/шторм; огненные дожди — всегда при аномалии».
-- Зеркало src/lib/raid/weatherClimate.ts, weatherOdds.ts, weatherRitual.ts, weatherRoll.ts
-- (weather-08-migration.test сверяет).
--
-- 1. settings.weather_climate_world {mapId: {tempMin, tempMax, levels, anomaly}} — пишет админка.
--    raid_weather_climate(map): мира нет или запись битая — как всегда (−40…+40, все три
--    уровня, без аномалий), и бросок мира тот же до цифры (те же распределения, тот же
--    порядок random()).
-- 2. Температура ходит по лестнице мира (raid_weather_temp_ladder): tempMin…tempMax через
--    10 °C, с холодом снизу −60, −50, с жарой сверху +50, +60. Шаг — на соседнюю ступень,
--    за край выбрасывается (остальные делят долю). Сейчас не на лестнице (диапазон сузили,
--    аномалию сняли) — следующая смена ставит ближайшую точку диапазона.
-- 3. Уровень — только из отмеченных подряд; сейчас чужой — ближайший отмеченный.
-- 4. Аномалия (≤ −50 / ≥ +50): уровень — шторм, значок — метель (холод) / огненный дождь
--    (fire_rain, только тут), коэффициенты 0 / 0 / 0 / ×20 / ×20 вместо смеси.
-- 5. raid_weather_ensure (тело weather-07) и raid_weather_ritual (тело weather-06) — с климатом;
--    обряд — только за возможное в этом мире.
-- 6. Точки возрождения мобов и мешочков (SPAWN_WEATHER) не меняются: аномалия холода — это
--    метель и мороз, жары — жара (+30 и выше); огненный дождь отдельной погодой точки не выбирается.
--
-- Код от файла не зависит (климата нет — всё как всегда). Одной транзакцией. Повтор
-- безвреден; повтор weather-01/03/04/06/07 после этого файла вернёт бросок без климата —
-- тогда сразу повторить этот файл.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── Строки погоды: аномальные температуры и огненный дождь.
ALTER TABLE yuplink.raid_weather DROP CONSTRAINT IF EXISTS raid_weather_temp_c_check;
ALTER TABLE yuplink.raid_weather ADD CONSTRAINT raid_weather_temp_c_check
  CHECK (temp_c BETWEEN -60 AND 60);
ALTER TABLE yuplink.raid_weather DROP CONSTRAINT IF EXISTS raid_weather_kind_check;
ALTER TABLE yuplink.raid_weather ADD CONSTRAINT raid_weather_kind_check CHECK (
     (temp_c BETWEEN -40 AND 40 AND (
          (level = 'clear' AND kind = 'clear')
       OR (level = 'overcast' AND (kind IN ('overcast', 'fog') OR (kind = 'rain' AND temp_c >= 0)))
       OR (level = 'storm' AND ((kind = 'blizzard' AND temp_c < 0)
                                OR (kind IN ('storm', 'thunderstorm') AND temp_c >= 0)))))
  OR (temp_c <= -50 AND level = 'storm' AND kind = 'blizzard')
  OR (temp_c >= 50 AND level = 'storm' AND kind = 'fire_rain'));

-- ── 1. Климат мира: проверка — как weatherClimateError, не сходится — как всегда.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_climate(p_map text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  -- weather-climate-default:
  v_def jsonb := '{"tempMin": -40, "tempMax": 40, "levels": ["clear", "overcast", "storm"],
                   "anomaly": null}'::jsonb;
  -- /weather-climate-default
  c_lv  CONSTANT text[] := ARRAY['clear', 'overcast', 'storm'];
  v_set jsonb;
  v_min numeric := -40;
  v_max numeric := 40;
  v_lv  text[] := ARRAY['clear', 'overcast', 'storm'];
  v_an  jsonb := 'null'::jsonb;
BEGIN
  BEGIN
    SELECT s.value::jsonb -> p_map INTO v_set FROM yuplink.settings s
     WHERE s.key = 'weather_climate_world';
  EXCEPTION WHEN others THEN
    RETURN v_def;
  END;
  IF v_set IS NULL OR jsonb_typeof(v_set) <> 'object' THEN
    RETURN v_def;
  END IF;
  IF jsonb_typeof(v_set -> 'tempMin') = 'number' THEN
    v_min := (v_set ->> 'tempMin')::numeric;
  END IF;
  IF jsonb_typeof(v_set -> 'tempMax') = 'number' THEN
    v_max := (v_set ->> 'tempMax')::numeric;
  END IF;
  IF v_set ? 'anomaly' THEN
    v_an := v_set -> 'anomaly';
  END IF;
  IF jsonb_typeof(v_set -> 'levels') = 'array' THEN
    -- Чужое значение — запись битая; порядок — ясно → шторм, повторы схлопываются.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_set -> 'levels') e
                WHERE jsonb_typeof(e) <> 'string' OR NOT (e #>> '{}') = ANY (c_lv)) THEN
      RETURN v_def;
    END IF;
    v_lv := ARRAY(SELECT u.l FROM unnest(c_lv) WITH ORDINALITY AS u(l, n)
                   WHERE (v_set -> 'levels') ? u.l ORDER BY u.n);
  END IF;
  IF v_min NOT IN (-40, -30, -20, -10, 0, 10, 20, 30, 40)
     OR v_max NOT IN (-40, -30, -20, -10, 0, 10, 20, 30, 40)
     OR v_min > v_max
     OR cardinality(v_lv) = 0
     OR array_position(c_lv, v_lv[cardinality(v_lv)]) - array_position(c_lv, v_lv[1]) + 1
        <> cardinality(v_lv)
     OR v_an NOT IN ('null'::jsonb, '"cold"'::jsonb, '"heat"'::jsonb) THEN
    RETURN v_def;
  END IF;
  RETURN jsonb_build_object('tempMin', v_min::int, 'tempMax', v_max::int,
                            'levels', to_jsonb(v_lv), 'anomaly', v_an);
END $fn$;

-- ── 2. Лестница температур мира — точки по возрастанию.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_temp_ladder(p_climate jsonb)
RETURNS int[]
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT ARRAY(
    SELECT a.t FROM unnest(ARRAY[-60, -50]) AS a(t) WHERE p_climate ->> 'anomaly' = 'cold'
    UNION ALL
    SELECT generate_series((p_climate ->> 'tempMin')::int, (p_climate ->> 'tempMax')::int, 10)
    UNION ALL
    SELECT a.t FROM unnest(ARRAY[50, 60]) AS a(t) WHERE p_climate ->> 'anomaly' = 'heat'
    ORDER BY 1)
$fn$;

-- Соседняя ступень (p_dir +1 — теплее, −1 — холоднее); нет её или не на лестнице — NULL.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_temp_step(p_prev int, p_climate jsonb, p_dir int)
RETURNS int
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT x.l[array_position(x.l, floor((p_prev + 5) / 10.0)::int * 10) + p_dir]
    FROM (SELECT yuplink.raid_weather_temp_ladder(p_climate) AS l) x
$fn$;

-- ── 3. Температура следующего слота с климатом: [{v, p}] — холоднее, та же, теплее (как
--    raid_weather_temp_dist: без климата тот же список до цифры).
CREATE OR REPLACE FUNCTION yuplink.raid_weather_temp_dist_in(p_prev int, p_odds jsonb, p_climate jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  WITH x AS (
    SELECT y.l, y.b, array_position(y.l, y.b) AS i,
           (p_odds ->> 'tempDown')::numeric AS dn, (p_odds ->> 'tempUp')::numeric AS up
      FROM (SELECT yuplink.raid_weather_temp_ladder(p_climate) AS l,
                   floor((p_prev + 5) / 10.0)::int * 10 AS b) y
  ), d AS (
    SELECT o.n, x.l[x.i + o.s] AS v,
           CASE o.s WHEN -1 THEN x.dn WHEN 1 THEN x.up ELSE 100 - x.dn - x.up END AS p
      FROM x, (VALUES (1, -1), (2, 0), (3, 1)) AS o(n, s)
     WHERE x.l[x.i + o.s] IS NOT NULL
  )
  SELECT CASE
    WHEN x.i IS NULL THEN jsonb_build_array(jsonb_build_object('v',
      least((p_climate ->> 'tempMax')::int, greatest((p_climate ->> 'tempMin')::int, x.b)), 'p', 100))
    WHEN (SELECT sum(d.p) FROM d) <= 0 THEN jsonb_build_array(jsonb_build_object('v', x.b, 'p', 100))
    ELSE (SELECT jsonb_agg(jsonb_build_object('v', d.v, 'p', d.p) ORDER BY d.n) FROM d)
  END
    FROM x
$fn$;

-- ── 4. Уровень следующего слота с климатом: переходы в чужие уровни выброшены; сейчас
--    чужой — ближайший отмеченный; остались одни нули — тот же.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_level_dist_in(p_prev text, p_odds jsonb, p_climate jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  WITH a AS (
    SELECT ARRAY(SELECT jsonb_array_elements_text(p_climate -> 'levels')) AS lv
  ), d AS (
    SELECT e.x, e.n
      FROM a, jsonb_array_elements(yuplink.raid_weather_level_dist(p_prev, p_odds))
              WITH ORDINALITY AS e(x, n)
     WHERE (e.x ->> 'v') = ANY (a.lv)
  )
  SELECT CASE
    WHEN NOT p_prev = ANY (a.lv) THEN jsonb_build_array(jsonb_build_object('v',
      CASE WHEN array_position(ARRAY['clear', 'overcast', 'storm'], p_prev)
                < array_position(ARRAY['clear', 'overcast', 'storm'], a.lv[1])
           THEN a.lv[1] ELSE a.lv[cardinality(a.lv)] END, 'p', 100))
    WHEN COALESCE((SELECT sum((d.x ->> 'p')::numeric) FROM d), 0) <= 0
      THEN jsonb_build_array(jsonb_build_object('v', p_prev, 'p', 100))
    ELSE (SELECT jsonb_agg(d.x ORDER BY d.n) FROM d)
  END
    FROM a
$fn$;

-- Голоса температуры в ключах распределения: «теплее» / «холоднее» — соседние ступени.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_temp_votes_in(p_prev int, p_votes jsonb, p_climate jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT COALESCE(CASE WHEN u.v IS NOT NULL AND p_votes ? 'warmer'
                       THEN jsonb_build_object(u.v::text, p_votes -> 'warmer') END, '{}'::jsonb)
      || COALESCE(CASE WHEN d.v IS NOT NULL AND p_votes ? 'colder'
                       THEN jsonb_build_object(d.v::text, p_votes -> 'colder') END, '{}'::jsonb)
    FROM (SELECT yuplink.raid_weather_temp_step(p_prev, p_climate, 1) AS v) u,
         (SELECT yuplink.raid_weather_temp_step(p_prev, p_climate, -1) AS v) d
$fn$;

-- ── 5. Первый слот мира: точка диапазона и отмеченный уровень — поровну (p_rnd ∈ [0, 1)).
CREATE OR REPLACE FUNCTION yuplink.raid_weather_first_temp(p_climate jsonb, p_rnd double precision)
RETURNS int
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT x.lo + 10 * least(x.n - 1, greatest(0, floor(p_rnd * x.n)::int))
    FROM (SELECT (p_climate ->> 'tempMin')::int AS lo,
                 ((p_climate ->> 'tempMax')::int - (p_climate ->> 'tempMin')::int) / 10 + 1 AS n) x
$fn$;

CREATE OR REPLACE FUNCTION yuplink.raid_weather_first_level(p_climate jsonb, p_rnd double precision)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT x.lv[1 + least(cardinality(x.lv) - 1, greatest(0, floor(p_rnd * cardinality(x.lv))::int))]
    FROM (SELECT ARRAY(SELECT jsonb_array_elements_text(p_climate -> 'levels')) AS lv) x
$fn$;

-- ── 6. Значок: аномалия — метель / огненный дождь; огненный дождь вне аномалии не держится.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_next_kind(
  p_prev_level text, p_prev_kind text, p_level text, p_temp int, p_rnd double precision)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT CASE
    WHEN p_temp <= -50 THEN 'blizzard'
    WHEN p_temp >= 50 THEN 'fire_rain'
    WHEN p_prev_level = p_level
         AND p_prev_kind <> 'fire_rain'
         AND NOT (p_temp < 0 AND p_prev_kind IN ('rain', 'storm', 'thunderstorm'))
         AND NOT (p_temp >= 0 AND p_prev_kind = 'blizzard')
      THEN p_prev_kind
    ELSE yuplink.raid_weather_kind_for(p_level, p_temp, p_rnd)
  END
$fn$;

-- ── 7. Коэффициент: аномалия — вместо смеси; иначе как weather-01 (таблицы те же).
CREATE OR REPLACE FUNCTION yuplink.raid_weather_coef_of(p_temp int, p_level text, p_what text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT CASE WHEN p_temp <= -50 OR p_temp >= 50 THEN (
    -- weather-anomaly: рыба | шахты | фермы | ход героя | ход корабля
    CASE p_what WHEN 'fish' THEN 0 WHEN 'mine' THEN 0 WHEN 'farm' THEN 0
                WHEN 'step' THEN 20 WHEN 'ship' THEN 20 END
    -- /weather-anomaly
    )::numeric
  ELSE (
  SELECT CASE WHEN t.c = 1 THEN w.c
              WHEN w.c = 1 THEN t.c
              ELSE round((t.c + w.c) / 2, 4) END
    FROM (SELECT (CASE p_what WHEN 'fish' THEN b.fish WHEN 'mine' THEN b.mine
                              WHEN 'farm' THEN b.farm WHEN 'step' THEN b.step
                              WHEN 'ship' THEN b.ship END)::numeric AS c
            FROM (VALUES
              -- weather-temp: до °C включительно | рыба | шахты | фермы | ход героя | ход корабля
              (-30, 0,   0.1, 0.1, 2,   10),
              (-10, 0.5, 0.4, 0.4, 1.5, 4),
              ( 10, 1,   0.7, 0.7, 1,   2),
              ( 30, 2,   1,   1,   1,   1),
              ( 40, 4,   1,   2,   1,   1)
              -- /weather-temp
            ) AS b(upto, fish, mine, farm, step, ship)
           WHERE p_temp <= b.upto
           ORDER BY b.upto
           LIMIT 1) t,
         (SELECT (CASE p_what WHEN 'fish' THEN l.fish WHEN 'mine' THEN l.mine
                              WHEN 'farm' THEN l.farm WHEN 'step' THEN l.step
                              WHEN 'ship' THEN l.ship END)::numeric AS c
            FROM (VALUES
              -- weather-level: уровень | рыба | шахты | фермы | ход героя | ход корабля
              ('clear',  1, 1,    2,    1, 1),
              ('overcast', 4, 0.5,  0.5,  2, 2),
              ('storm',  0, 0.01, 0.01, 5, 10)
              -- /weather-level
            ) AS l(level, fish, mine, farm, step, ship)
           WHERE l.level = p_level) w
  ) END
$fn$;

-- ── 8. Слот карты: тело weather-07, бросок — с климатом мира.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_ensure(p_map text, p_at timestamptz DEFAULT now())
RETURNS yuplink.raid_weather
LANGUAGE plpgsql
AS $function$
DECLARE
  v_slot  timestamptz := yuplink.raid_weather_slot(COALESCE(p_at, now()));
  v_row   yuplink.raid_weather;
  v_at    timestamptz;
  v_t     int;
  v_lvl   text;
  v_kind  text;
  v_fx    boolean;
  v_odds  jsonb;
  v_cl    jsonb;
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
  -- Следующий слот после последнего известного — по новой сетке (старая запись тоже ведёт).
  v_at := CASE WHEN v_row.map_id IS NULL THEN v_slot
               ELSE yuplink.raid_weather_slot_end(v_row.slot_at) END;
  -- Влияние нового слота — флаг сейчас; включили или выключили посреди слота — со следующего.
  v_fx := EXISTS (SELECT 1 FROM yuplink.settings s
                   WHERE s.key = 'weather_effects' AND btrim(s.value, ' "') = 'on');
  v_odds := yuplink.raid_weather_odds(p_map);
  v_cl := yuplink.raid_weather_climate(p_map);

  WHILE v_at <= v_slot LOOP
    IF v_row.map_id IS NULL THEN
      v_t := yuplink.raid_weather_first_temp(v_cl, random());
      v_lvl := yuplink.raid_weather_first_level(v_cl, random());
      v_kind := yuplink.raid_weather_kind_for(v_lvl, v_t, random());
    ELSE
      v_votes := yuplink.raid_weather_votes(p_map, v_row.slot_at);
      v_t := (yuplink.raid_weather_pick(yuplink.raid_weather_apply_votes(
               yuplink.raid_weather_temp_dist_in(v_row.temp_c, v_odds, v_cl),
               yuplink.raid_weather_temp_votes_in(v_row.temp_c, v_votes, v_cl)), random()) #>> '{}')::int;
      v_lvl := yuplink.raid_weather_pick(yuplink.raid_weather_apply_votes(
                 yuplink.raid_weather_level_dist_in(v_row.level, v_odds, v_cl), v_votes), random()) #>> '{}';
      -- Аномалия — всегда шторм (значок — raid_weather_next_kind: метель / огненный дождь).
      IF v_t <= -50 OR v_t >= 50 THEN
        v_lvl := 'storm';
      END IF;
      v_kind := yuplink.raid_weather_next_kind(v_row.level, v_row.kind, v_lvl, v_t, random());
    END IF;
    -- Слот уже кончился (дописан задним числом) — без влияния: прошлое неизменно.
    INSERT INTO yuplink.raid_weather (map_id, slot_at, temp_c, level, kind, fx, ends_at)
    VALUES (p_map, v_at, v_t, v_lvl, v_kind,
            v_fx AND yuplink.raid_weather_slot_end(v_at) > now(), yuplink.raid_weather_slot_end(v_at))
    ON CONFLICT (map_id, slot_at) DO NOTHING;
    -- Лёг чужой бросок (другой процесс успел раньше) — цепочка дальше от него.
    SELECT * INTO v_row FROM yuplink.raid_weather w WHERE w.map_id = p_map AND w.slot_at = v_at;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    v_at := yuplink.raid_weather_slot_end(v_at);
  END LOOP;
  RETURN v_row;
END $function$;

-- ── 9. Обряд: тело weather-06, «можно ли» — по климату мира (уровни мира, ступени лестницы).
-- 'ok' | 'bad_target' | 'no_weather' | 'too_late' | 'cannot' | 'already' | 'no_shaman'.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_ritual(p_acc text, p_map text, p_target text, p_op text)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  v_slot timestamptz := yuplink.raid_weather_slot(now());
  v_row  yuplink.raid_weather;
  v_cl   jsonb;
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
  -- Один обряд в КАЖДОМ мире за смену (владелец 29.10.2026).
  SELECT * INTO v_prev FROM yuplink.raid_weather_vote v
   WHERE v.slot_at = v_slot AND v.account_id = p_acc AND v.map_id = p_map;
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

  -- Только возможное в этом мире: шаг — если есть соседняя ступень лестницы (аномалия —
  -- только с галкой), уровень — из уровней мира и сейчас уровень мира (как ritualTargets).
  v_cl := yuplink.raid_weather_climate(p_map);
  IF (p_target = 'warmer' AND yuplink.raid_weather_temp_step(v_row.temp_c, v_cl, 1) IS NULL)
     OR (p_target = 'colder' AND yuplink.raid_weather_temp_step(v_row.temp_c, v_cl, -1) IS NULL)
     OR (p_target IN ('clear', 'overcast', 'storm')
         AND NOT ((v_cl -> 'levels') ? v_row.level AND (v_cl -> 'levels') ? p_target
                  AND EXISTS (SELECT 1 FROM jsonb_array_elements(
                        yuplink.raid_weather_level_dist(v_row.level, yuplink.raid_weather_odds(p_map))) x
                       WHERE x ->> 'v' = p_target))) THEN
    RETURN 'cannot';
  END IF;

  IF NOT yuplink.castle_shaman_take(p_acc) THEN
    RETURN 'no_shaman';
  END IF;
  INSERT INTO yuplink.raid_weather_vote (slot_at, account_id, map_id, target, op_id)
  VALUES (v_slot, p_acc, p_map, p_target, p_op);
  RETURN 'ok';
END $function$;

COMMIT;
