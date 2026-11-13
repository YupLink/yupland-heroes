-- Погода по мирам (Ярослав 31.10.2026: «погоду мне бы по мирам тоже настраивать»; 29.10: «адский мир —
-- чаще жара, Хель — мороз»). У каждого мира могут быть свои шансы смены — settings.weather_odds_world
-- {mapId: {clearToOvercast…tempUp}}: заданные числа мира поверх общих (settings.weather_odds), мира
-- нет — общие. Проверка — та же, что у общих (weatherOddsError): не сходится — общие.
--
-- raid_weather_ensure и raid_weather_ritual — тела с прода 31.10 (md5 = weather-04 / weather-05),
-- единственная правка: raid_weather_odds() → raid_weather_odds(p_map).
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION yuplink.raid_weather_odds(p_map text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_base jsonb := yuplink.raid_weather_odds();
  v_set  jsonb;
  v_o    jsonb;
  k      text;
BEGIN
  BEGIN
    SELECT s.value::jsonb -> p_map INTO v_set FROM yuplink.settings s WHERE s.key = 'weather_odds_world';
  EXCEPTION WHEN others THEN
    RETURN v_base;
  END;
  IF v_set IS NULL OR jsonb_typeof(v_set) <> 'object' THEN
    RETURN v_base;
  END IF;
  v_o := v_base;
  FOR k IN SELECT jsonb_object_keys(v_base) LOOP
    IF jsonb_typeof(v_set -> k) = 'number' THEN
      v_o := jsonb_set(v_o, ARRAY[k], v_set -> k);
    END IF;
  END LOOP;
  FOR k IN SELECT jsonb_object_keys(v_o) LOOP
    IF (v_o ->> k)::numeric <> trunc((v_o ->> k)::numeric)
       OR (v_o ->> k)::numeric NOT BETWEEN 0 AND 100 THEN
      RETURN v_base;
    END IF;
  END LOOP;
  IF (v_o ->> 'overcastToClear')::numeric + (v_o ->> 'overcastToStorm')::numeric > 100
     OR (v_o ->> 'tempDown')::numeric + (v_o ->> 'tempUp')::numeric > 100 THEN
    RETURN v_base;
  END IF;
  RETURN v_o;
END $function$;

CREATE OR REPLACE FUNCTION yuplink.raid_weather_ensure(p_map text, p_at timestamp with time zone DEFAULT now())
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
  v_odds := yuplink.raid_weather_odds(p_map);

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
END $function$;

CREATE OR REPLACE FUNCTION yuplink.raid_weather_ritual(p_acc text, p_map text, p_target text, p_op text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
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

  v_base := yuplink.raid_weather_temp_base(v_row.temp_c);
  IF (p_target = 'warmer' AND v_base + 10 > 40)
     OR (p_target = 'colder' AND v_base - 10 < -40)
     OR (p_target IN ('clear', 'overcast', 'storm')
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
               yuplink.raid_weather_level_dist(v_row.level, yuplink.raid_weather_odds(p_map))) x
              WHERE x ->> 'v' = p_target)) THEN
    RETURN 'cannot';
  END IF;

  IF NOT yuplink.castle_shaman_take(p_acc) THEN
    RETURN 'no_shaman';
  END IF;
  INSERT INTO yuplink.raid_weather_vote (slot_at, account_id, map_id, target, op_id)
  VALUES (v_slot, p_acc, p_map, p_target, p_op);
  RETURN 'ok';
END $function$;
