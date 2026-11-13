-- Обряд шамана — по одному в КАЖДОМ мире за смену (владелец, 29.10.2026: «в каждом мире
-- можно один обряд сделать … каждые три часа»). Было (weather-04): один на все миры.
-- Ключ голоса — слот + аккаунт + мир; функция обряда проверяет «уже был» по миру.
-- СТРОГО ПОСЛЕ weather-04. Одной транзакцией: psql -1. Повтор безвреден. Повтор weather-04
-- после этого файла вернёт «один на все миры» — тогда сразу повторить этот файл.
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_weather_vote DROP CONSTRAINT IF EXISTS raid_weather_vote_pkey;
ALTER TABLE yuplink.raid_weather_vote ADD CONSTRAINT raid_weather_vote_pkey
  PRIMARY KEY (slot_at, account_id, map_id);

-- Обряд: 'ok' | 'bad_target' | 'no_weather' | 'too_late' | 'cannot' | 'already' | 'no_shaman'.
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
