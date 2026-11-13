-- Плавная смена погоды (владелец, 28.10.2026): «если идёт N — с большей вероятностью N и
-- будет, но есть вероятность другой погоды»; температура «−10 / та же / +10».
-- Зеркало src/lib/raid/weatherOdds.ts (weather-03-migration.test сверяет).
--
-- 1. raid_weather_odds() — шансы в процентах: значения по умолчанию + settings.weather_odds
--    (пишет админка). Битая настройка — по умолчанию, погода не встаёт.
-- 2. Уровень — только на соседний: ясно ↔ пасмурно ↔ шторм (по умолчанию остаётся 50 %).
-- 3. Температура — на сетке через 10 °C: −10 / та же / +10 = 30 / 40 / 30 %, за −40…+40
--    не выходит (шаг за край выбрасывается, его доля делится между остальными).
-- 4. Уровень остался — значок прежний, если возможен при новой температуре.
-- 5. raid_weather_ensure — прежний (weather-01), меняется только бросок следующего слота;
--    первый слот карты — любой уровень поровну, температура — любая точка сетки.
-- Уже лежащие слоты не трогаются. Код от файла не зависит. Повтор безвреден, но ПОСЛЕ
-- weather-04 вернёт бросок без голосов шаманов — тогда сразу повторить weather-04-ritual.sql.
-- Накатывать одной транзакцией: psql -1 (на проде так и накатан 28.10.2026).

-- ── 1. Шансы.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_odds()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  -- weather-odds-default:
  v_def jsonb := '{"clearToOvercast": 50, "overcastToClear": 25, "overcastToStorm": 25,
                   "stormToOvercast": 50, "tempDown": 30, "tempUp": 30}'::jsonb;
  -- /weather-odds-default
  v_set jsonb;
  v_o   jsonb;
  k     text;
BEGIN
  BEGIN
    SELECT s.value::jsonb INTO v_set FROM yuplink.settings s WHERE s.key = 'weather_odds';
  EXCEPTION WHEN others THEN
    RETURN v_def;
  END;
  IF v_set IS NULL OR jsonb_typeof(v_set) <> 'object' THEN
    RETURN v_def;
  END IF;
  v_o := v_def;
  FOR k IN SELECT jsonb_object_keys(v_def) LOOP
    IF jsonb_typeof(v_set -> k) = 'number' THEN
      v_o := jsonb_set(v_o, ARRAY[k], v_set -> k);
    END IF;
  END LOOP;
  -- Та же проверка, что weatherOddsError: не сходится — по умолчанию.
  FOR k IN SELECT jsonb_object_keys(v_o) LOOP
    IF (v_o ->> k)::numeric <> trunc((v_o ->> k)::numeric)
       OR (v_o ->> k)::numeric NOT BETWEEN 0 AND 100 THEN
      RETURN v_def;
    END IF;
  END LOOP;
  IF (v_o ->> 'overcastToClear')::numeric + (v_o ->> 'overcastToStorm')::numeric > 100
     OR (v_o ->> 'tempDown')::numeric + (v_o ->> 'tempUp')::numeric > 100 THEN
    RETURN v_def;
  END IF;
  RETURN v_o;
END $fn$;

-- ── 2. Уровень следующего слота; p_rnd ∈ [0, 1).
CREATE OR REPLACE FUNCTION yuplink.raid_weather_next_level(p_prev text, p_odds jsonb, p_rnd double precision)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT CASE
    WHEN p_prev = 'clear' THEN
      CASE WHEN p_rnd * 100 < (p_odds ->> 'clearToOvercast')::numeric THEN 'overcast' ELSE 'clear' END
    WHEN p_prev = 'storm' THEN
      CASE WHEN p_rnd * 100 < (p_odds ->> 'stormToOvercast')::numeric THEN 'overcast' ELSE 'storm' END
    WHEN p_rnd * 100 < (p_odds ->> 'overcastToClear')::numeric THEN 'clear'
    WHEN p_rnd * 100 < (p_odds ->> 'overcastToClear')::numeric
                     + (p_odds ->> 'overcastToStorm')::numeric THEN 'storm'
    ELSE 'overcast'
  END
$fn$;

-- ── 3. Температура следующего слота; p_rnd ∈ [0, 1). Порядок исходов: −10, та же, +10.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_next_temp(p_prev int, p_odds jsonb, p_rnd double precision)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
AS $fn$
DECLARE
  v_base int := least(40, greatest(-40, floor((p_prev + 5) / 10.0)::int * 10));
  v_down numeric := (p_odds ->> 'tempDown')::numeric;
  v_up   numeric := (p_odds ->> 'tempUp')::numeric;
  v_sum  numeric := 0;
  v_acc  numeric := 0;
  v_w    numeric;
  d      int;
BEGIN
  FOREACH d IN ARRAY ARRAY[-10, 0, 10] LOOP
    IF v_base + d BETWEEN -40 AND 40 THEN
      v_sum := v_sum + CASE d WHEN -10 THEN v_down WHEN 10 THEN v_up ELSE 100 - v_down - v_up END;
    END IF;
  END LOOP;
  IF v_sum <= 0 THEN
    RETURN v_base;
  END IF;
  FOREACH d IN ARRAY ARRAY[-10, 0, 10] LOOP
    IF v_base + d BETWEEN -40 AND 40 THEN
      v_w := CASE d WHEN -10 THEN v_down WHEN 10 THEN v_up ELSE 100 - v_down - v_up END;
      v_acc := v_acc + v_w;
      IF v_w > 0 AND p_rnd * v_sum < v_acc THEN
        RETURN v_base + d;
      END IF;
    END IF;
  END LOOP;
  RETURN v_base;
END $fn$;

-- ── 4. Значок: уровень тот же и прежний значок возможен при этой температуре — он.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_next_kind(
  p_prev_level text, p_prev_kind text, p_level text, p_temp int, p_rnd double precision)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT CASE
    WHEN p_prev_level = p_level
         AND NOT (p_temp < 0 AND p_prev_kind IN ('rain', 'storm', 'thunderstorm'))
         AND NOT (p_temp >= 0 AND p_prev_kind = 'blizzard')
      THEN p_prev_kind
    ELSE yuplink.raid_weather_kind_for(p_level, p_temp, p_rnd)
  END
$fn$;

-- ── 5. Слот карты: как в weather-01, бросок следующего — по шансам выше.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_ensure(p_map text, p_at timestamptz DEFAULT now())
RETURNS yuplink.raid_weather
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_slot timestamptz := yuplink.raid_weather_slot(COALESCE(p_at, now()));
  v_row  yuplink.raid_weather;
  v_at   timestamptz;
  v_t    int;
  v_lvl  text;
  v_kind text;
  v_fx   boolean;
  v_odds jsonb;
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

  -- Последний известный слот — от него цепочка; истории нет — один этот слот.
  SELECT * INTO v_row FROM yuplink.raid_weather w
   WHERE w.map_id = p_map AND w.slot_at < v_slot
   ORDER BY w.slot_at DESC
   LIMIT 1;
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
      v_t := yuplink.raid_weather_next_temp(v_row.temp_c, v_odds, random());
      v_lvl := yuplink.raid_weather_next_level(v_row.level, v_odds, random());
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
