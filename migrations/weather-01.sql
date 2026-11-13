-- Погода рейда (владелец, 26.10.2026): «погода общая на мир … новая каждые 3 часа,
-- случайно … от −40 до +40 … без резких скачков: если −40, следующий рандом может
-- выпасть −30 или −20». Острова новичка — без погоды.
--
-- 1. raid_weather — история по слотам (map_id, slot_at): температура, уровень
--    (clear | overcast | storm — ясно / пасмурно / шторм), значок (clear, overcast, rain,
--    fog, storm, thunderstorm, blizzard). Слот — 3 часа по UTC (00, 03, …, 21):
--    raid_weather_slot(at). Проверка строки — правила значка: дождя в минус нет,
--    метель только в минус, шторм и гроза — только с нуля и выше. fx — влияние на
--    экономику у этого слота: пишется при создании слота и больше не меняется.
-- 2. raid_weather_ensure(map, at) — слот карты, где лежит at: нет — дописать
--    цепочкой от последнего известного слота до этого (температура — поровну в
--    пределах ±20 от прошлого, обрезанных до −40…+40; истории нет — один слот,
--    любая −40…+40), уровень — поровну, значок — raid_weather_kind_for. До 4 рабочих
--    процессов разом: INSERT … ON CONFLICT DO NOTHING и чтение того, что легло, —
--    следующий слот цепочки считается от записанного, а не от своего броска.
--    fx = settings.weather_effects 'on' в момент создания; слот, который к этому
--    моменту уже кончился (дописан задним числом), — fx false: прошлое неизменно.
--    Остров (isle_… или карта raid_island), неизвестная карта, слот раньше уже
--    записанных — NULL (погоды нет, прошлое не дописывается).
-- 3. raid_weather_tick(at) — обход открытых карт (raid_maps.active и главный мир,
--    кроме островов) раз за слот; зовёт сервер (weather-sweep.ts). Повтор безвреден.
-- 4. raid_weather_coef(map, at, what), what ∈ fish | mine | farm | step | ship —
--    итог по слоту, где лежит at (владелец, уточнение 26.10: «стандарт» = 1 в среднем
--    не участвует — температурный 1 → погодный, погодный 1 → температурный, иначе
--    (температурный + погодный) / 2); 1 — остров, нет строки слота, у слота fx
--    false, неизвестный what. settings не читает. Быстрый: ключ raid_weather. Таблицы коэффициентов — raid_weather_coef_of; те же —
--    src/lib/raid/weather.ts (тест weather-01 сверяет).
--
-- Влияние на экономику включает ведущий: settings.weather_effects = 'on'. Включение и
-- выключение действуют со следующей смены погоды (новый слот), прошлое не пересчитывается.
-- СТРОГО ДО КОДА. Повтор файла безвреден — но ПОСЛЕ weather-03 (28.10.2026) повтор вернёт
-- равномерный бросок raid_weather_ensure: тогда сразу повторить weather-03-odds.sql и
-- weather-04-ritual.sql (по порядку).
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. История погоды по слотам.
CREATE TABLE IF NOT EXISTS yuplink.raid_weather (
  map_id     text NOT NULL REFERENCES yuplink.raid_maps(id) ON DELETE CASCADE,
  slot_at    timestamptz NOT NULL,
  temp_c     int NOT NULL CHECK (temp_c BETWEEN -40 AND 40),
  level      text NOT NULL,
  kind       text NOT NULL,
  fx         boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, slot_at),
  CONSTRAINT raid_weather_kind_check CHECK (
       (level = 'clear' AND kind = 'clear')
    OR (level = 'overcast' AND (kind IN ('overcast', 'fog') OR (kind = 'rain' AND temp_c >= 0)))
    OR (level = 'storm' AND ((kind = 'blizzard' AND temp_c < 0)
                             OR (kind IN ('storm', 'thunderstorm') AND temp_c >= 0)))
  )
);
ALTER TABLE yuplink.raid_weather ADD COLUMN IF NOT EXISTS fx boolean NOT NULL DEFAULT false;

-- Начало слота: 3 часа от полуночи UTC (не зависит от TimeZone сессии).
CREATE OR REPLACE FUNCTION yuplink.raid_weather_slot(p_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT date_bin(interval '3 hours', p_at, timestamptz '2000-01-01 00:00:00+00')
$fn$;

-- ── Значок внутри уровня — «как в природе» от температуры; p_rnd ∈ [0, 1), поровну.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_kind_for(p_level text, p_temp int, p_rnd double precision)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT x.k[1 + least(cardinality(x.k) - 1, greatest(0, floor(p_rnd * cardinality(x.k))::int))]
    FROM (SELECT CASE
                   WHEN p_level = 'clear' THEN ARRAY['clear']
                   WHEN p_level = 'overcast' AND p_temp < 0 THEN ARRAY['overcast', 'fog']
                   WHEN p_level = 'overcast' THEN ARRAY['overcast', 'fog', 'rain']
                   WHEN p_temp < 0 THEN ARRAY['blizzard']
                   ELSE ARRAY['storm', 'thunderstorm']
                 END AS k) x
$fn$;

-- ── Коэффициент по температуре и уровню: «стандарт» (1) в среднем не участвует —
--    температурный 1 → погодный, погодный 1 → температурный, иначе (t + w) / 2.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_coef_of(p_temp int, p_level text, p_what text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$
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
$fn$;

-- ── 2. Слот карты: есть — он; нет — дописать цепочкой от последнего известного.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_ensure(p_map text, p_at timestamptz DEFAULT now())
RETURNS yuplink.raid_weather
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_slot timestamptz := yuplink.raid_weather_slot(COALESCE(p_at, now()));
  v_row  yuplink.raid_weather;
  v_at   timestamptz;
  v_lo   int;
  v_hi   int;
  v_t    int;
  v_lvl  text;
  v_fx   boolean;
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

  WHILE v_at <= v_slot LOOP
    IF v_row.map_id IS NULL THEN
      v_lo := -40;
      v_hi := 40;
    ELSE
      v_lo := greatest(-40, v_row.temp_c - 20);
      v_hi := least(40, v_row.temp_c + 20);
    END IF;
    v_t := v_lo + least(v_hi - v_lo, floor(random() * (v_hi - v_lo + 1))::int);
    v_lvl := (ARRAY['clear', 'overcast', 'storm'])[1 + least(2, floor(random() * 3)::int)];
    -- Слот уже кончился (дописан задним числом) — без влияния: прошлое неизменно.
    INSERT INTO yuplink.raid_weather (map_id, slot_at, temp_c, level, kind, fx)
    VALUES (p_map, v_at, v_t, v_lvl, yuplink.raid_weather_kind_for(v_lvl, v_t, random()),
            v_fx AND v_at + interval '3 hours' > now())
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

-- ── 3. Обход открытых карт (и главного мира) — раз за слот, зовёт сервер.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_tick(p_at timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_n   integer := 0;
  v_row yuplink.raid_weather;
  m     text;
BEGIN
  -- Один порядок карт у всех процессов — встречных ожиданий нет.
  FOR m IN SELECT rm.id FROM yuplink.raid_maps rm
            WHERE (rm.active OR rm.id = (SELECT (s.value::jsonb)->>'mapId'
                                           FROM yuplink.settings s WHERE s.key = 'beta_raid_map'))
              AND left(rm.id, 5) <> 'isle_'
              AND NOT EXISTS (SELECT 1 FROM yuplink.raid_island i WHERE i.map_id = rm.id)
            ORDER BY rm.id LOOP
    v_row := yuplink.raid_weather_ensure(m, p_at);
    IF v_row.map_id IS NOT NULL THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END $fn$;

-- ── 4. Коэффициент по слоту, где лежит p_at: 1 — нет погоды или у слота влияние выключено.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_coef(p_map text, p_at timestamptz, p_what text)
RETURNS numeric
LANGUAGE sql
STABLE PARALLEL SAFE
AS $fn$
  SELECT COALESCE((
    SELECT yuplink.raid_weather_coef_of(w.temp_c, w.level, p_what)
      FROM yuplink.raid_weather w
     WHERE w.map_id = p_map
       AND w.slot_at = yuplink.raid_weather_slot(COALESCE(p_at, now()))
       AND left(p_map, 5) <> 'isle_'
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_island i WHERE i.map_id = p_map)
       AND w.fx
  ), 1::numeric)
$fn$;

COMMIT;
