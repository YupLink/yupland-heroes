-- Снег, 09.11.2026. Кайлани через владельца: «добавь обычный снег для „Холодно“ и „Очень
-- холодно“ — игра должна получать из API отдельный тип snow».
--
-- Снег — значок пасмурного уровня при −10 °C и ниже (как дождь — при нуле и выше): пасмурно
-- при таком холоде — поровну «пасмурно / туман / снег». Коэффициенты — пасмурные, как у
-- всего уровня. Метель (шторм в минус, аномалия холода) — как была. Зеркало — lib/raid/weather.ts
-- (weatherKindChoices, WEATHER_SNOW_MAX_C). Точки спавна мобов и лута — «снег» в списке погод.
-- Идемпотентно. Проба: BEGIN; \i …; ROLLBACK;

BEGIN;

CREATE OR REPLACE FUNCTION yuplink.raid_weather_kind_for(p_level text, p_temp integer, p_rnd double precision)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT x.k[1 + least(cardinality(x.k) - 1, greatest(0, floor(p_rnd * cardinality(x.k))::int))]
    FROM (SELECT CASE
                   WHEN p_level = 'clear' THEN ARRAY['clear']
                   WHEN p_level = 'overcast' AND p_temp <= -10 THEN ARRAY['overcast', 'fog', 'snow']
                   WHEN p_level = 'overcast' AND p_temp < 0 THEN ARRAY['overcast', 'fog']
                   WHEN p_level = 'overcast' THEN ARRAY['overcast', 'fog', 'rain']
                   WHEN p_temp < 0 THEN ARRAY['blizzard']
                   ELSE ARRAY['storm', 'thunderstorm']
                 END AS k) x
$fn$;

-- Значок держится между сменами, если подходит к новой температуре: снег — только до −10 °C.
CREATE OR REPLACE FUNCTION yuplink.raid_weather_next_kind(p_prev_level text, p_prev_kind text, p_level text, p_temp integer, p_rnd double precision)
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
         AND NOT (p_temp > -10 AND p_prev_kind = 'snow')
      THEN p_prev_kind
    ELSE yuplink.raid_weather_kind_for(p_level, p_temp, p_rnd)
  END
$fn$;

ALTER TABLE yuplink.raid_weather DROP CONSTRAINT IF EXISTS raid_weather_kind_check;
ALTER TABLE yuplink.raid_weather ADD CONSTRAINT raid_weather_kind_check CHECK (
  (temp_c >= -40 AND temp_c <= 40 AND (
     (level = 'clear' AND kind = 'clear')
     OR (level = 'overcast' AND (kind IN ('overcast', 'fog') OR (kind = 'rain' AND temp_c >= 0)
                                 OR (kind = 'snow' AND temp_c <= -10)))
     OR (level = 'storm' AND ((kind = 'blizzard' AND temp_c < 0)
                              OR (kind IN ('storm', 'thunderstorm') AND temp_c >= 0)))))
  OR (temp_c <= -50 AND level = 'storm' AND kind = 'blizzard')
  OR (temp_c >= 50 AND level = 'storm' AND kind = 'fire_rain'));

-- Погода точек спавна: + «снег».
ALTER TABLE yuplink.raid_mob_spawn DROP CONSTRAINT IF EXISTS raid_mob_spawn_weather_check;
ALTER TABLE yuplink.raid_mob_spawn ADD CONSTRAINT raid_mob_spawn_weather_check CHECK (
  weather IS NULL OR weather = ANY (ARRAY['clear', 'overcast', 'rain', 'fog', 'storm', 'thunderstorm',
                                          'blizzard', 'frost', 'heat', 'snow']));
ALTER TABLE yuplink.raid_mob_spawn DROP CONSTRAINT IF EXISTS raid_mob_spawn_weathers_check;
ALTER TABLE yuplink.raid_mob_spawn ADD CONSTRAINT raid_mob_spawn_weathers_check CHECK (
  weathers IS NULL OR weathers <@ ARRAY['clear', 'overcast', 'rain', 'fog', 'storm', 'thunderstorm',
                                        'blizzard', 'frost', 'heat', 'snow']);
ALTER TABLE yuplink.raid_loot_spawn DROP CONSTRAINT IF EXISTS raid_loot_spawn_weather_check;
ALTER TABLE yuplink.raid_loot_spawn ADD CONSTRAINT raid_loot_spawn_weather_check CHECK (
  weather IS NULL OR weather = ANY (ARRAY['clear', 'overcast', 'rain', 'fog', 'storm', 'thunderstorm',
                                          'blizzard', 'frost', 'heat', 'snow']));

COMMIT;
