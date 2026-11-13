-- Смена погоды по расписанию (владелец, 04.11.2026): «днём с 12:00 до 20:00 — раз в 2 часа,
-- ночью с 20:00 до 08:00 — раз в 4 часа, время Мск». Утро 08:00–12:00 — тоже слот 4 часа
-- (продолжение ночной сетки). Начала слотов по Москве (UTC+3, без перехода):
-- 00, 04, 08, 12, 14, 16, 18, 20 — восемь в сутки, как и раньше (было через 3 ч от 00 UTC).
--
-- Каждая запись погоды теперь знает свой конец (ends_at): старые — slot_at + 3 ч, новые —
-- конец своего слота. Погода на момент t — последняя запись с slot_at ≤ t, пока она не
-- кончилась: так прошлые часы (шахты, фермы) считаются по своей старой сетке, новые — по
-- новой, и стык не задваивает и не теряет часов.
--
-- ⚠️ Накатывать, когда новый текущий слот начался не раньше старого (по Москве 16:00–21:00,
-- 00:00–03:00, 04:00–06:00, 08:00–09:00 и т. п.), иначе до следующей смены «текущей» записи
-- не будет. Повтор безопасен (CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS).
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_weather ADD COLUMN IF NOT EXISTS ends_at timestamptz;
UPDATE yuplink.raid_weather SET ends_at = slot_at + interval '3 hours' WHERE ends_at IS NULL;

-- Начало слота по московской сетке (не зависит от TimeZone сессии).
CREATE OR REPLACE FUNCTION yuplink.raid_weather_slot(p_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT d.day0 + make_interval(hours => CASE
           WHEN m.h < 4 THEN 0 WHEN m.h < 8 THEN 4 WHEN m.h < 12 THEN 8
           WHEN m.h < 14 THEN 12 WHEN m.h < 16 THEN 14 WHEN m.h < 18 THEN 16
           WHEN m.h < 20 THEN 18 ELSE 20 END)
    FROM (SELECT date_bin(interval '1 day', p_at, timestamptz '2000-01-01 00:00:00+03') AS day0) d,
         LATERAL (SELECT extract(epoch FROM p_at - d.day0) / 3600 AS h) m
$fn$;

-- Конец слота, в котором p_at: днём (12–20 Мск) — через 2 часа, иначе — через 4.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_slot_end(p_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT x.s + CASE WHEN extract(epoch FROM x.s - date_bin(interval '1 day', x.s,
                                  timestamptz '2000-01-01 00:00:00+03')) / 3600 BETWEEN 12 AND 18
                    THEN interval '2 hours' ELSE interval '4 hours' END
    FROM (SELECT yuplink.raid_weather_slot(p_at) AS s) x
$fn$;

-- Коэффициент погоды на момент: последняя запись, пока не кончилась (с влиянием — fx).
CREATE OR REPLACE FUNCTION yuplink.raid_weather_coef(p_map text, p_at timestamptz, p_what text)
RETURNS numeric
LANGUAGE sql
STABLE PARALLEL SAFE
AS $fn$
  SELECT COALESCE((
    SELECT yuplink.raid_weather_coef_of(w.temp_c, w.level, p_what)
      FROM (SELECT COALESCE(p_at, now()) AS t) x
      CROSS JOIN LATERAL (
        SELECT * FROM yuplink.raid_weather r
         WHERE r.map_id = p_map AND r.slot_at <= x.t
         ORDER BY r.slot_at DESC LIMIT 1) w
     WHERE COALESCE(w.ends_at, w.slot_at + interval '3 hours') > x.t AND w.fx
       AND left(p_map, 5) <> 'isle_'
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_island i WHERE i.map_id = p_map)
  ), 1::numeric)
$fn$;

-- Слоты отрезка для окна шахты: записи, задевшие отрезок ([начало, мс; коэф. «шахты»]).
CREATE OR REPLACE FUNCTION yuplink.raid_mine_weather_slots(p_map text, p_from timestamptz,
                                                            p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $fn$
  SELECT CASE WHEN bool_or(x.k <> 1)
              THEN jsonb_agg(jsonb_build_array((extract(epoch FROM x.g) * 1000)::bigint, x.k)
                             ORDER BY x.g) END
    FROM (SELECT w.slot_at AS g, yuplink.raid_weather_coef(p_map, w.slot_at, 'mine') AS k
            FROM yuplink.raid_weather w
           WHERE w.map_id = p_map AND w.slot_at <= GREATEST(p_to, p_from)
             AND COALESCE(w.ends_at, w.slot_at + interval '3 hours') > p_from) x
$fn$;

-- Σ(коэф − 1) × секунды по записям отрезка (коэф. «фермы»). Запись тянется до своего конца
-- или до следующей записи (стык старой и новой сетки не считается дважды).
CREATE OR REPLACE FUNCTION yuplink.raid_field_weather_dsec(p_map text, p_from timestamptz,
                                                            p_to timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(sum((x.k - 1) * extract(epoch FROM (LEAST(p_to, x.e) - GREATEST(p_from, x.g))))
                    FILTER (WHERE x.k <> 1 AND LEAST(p_to, x.e) > GREATEST(p_from, x.g)), 0)
    FROM (SELECT w.slot_at AS g,
                 LEAST(COALESCE(w.ends_at, w.slot_at + interval '3 hours'),
                       COALESCE((SELECT min(n.slot_at) FROM yuplink.raid_weather n
                                  WHERE n.map_id = w.map_id AND n.slot_at > w.slot_at),
                                'infinity'::timestamptz)) AS e,
                 yuplink.raid_weather_coef(p_map, w.slot_at, 'farm') AS k
            FROM yuplink.raid_weather w
           WHERE w.map_id = p_map AND w.slot_at < p_to
             AND COALESCE(w.ends_at, w.slot_at + interval '3 hours') > p_from) x
   WHERE p_to > p_from
$fn$;

-- Погода слота: та же цепочка, что раньше, но шаг — до конца слота по новой сетке.
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

COMMIT;
