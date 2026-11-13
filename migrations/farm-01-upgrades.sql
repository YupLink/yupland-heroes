-- Улучшения игрока за алмаз (Ярослав 30.10.2026, владелец 31.10.2026: «1 раз всего — для каждого свой»):
--   farm      — все фермы (поля): +50 % к базе фермы для героев игрока и +1 личная ячейка склада;
--   warehouse — общие склады: +1 личная ячейка.
-- Каждое — один раз на аккаунт, цена — p_cost алмазов (UPGRADE_DIAMONDS в lib/accountUpgrade).
-- Списание и запись — одной функцией: res_move по ключу «upg:<вид>:<аккаунт>» второй раз не спишет.
--
-- raid_field_settle / raid_field_pending — тела с прода 31.10 (md5 = weather-02), правка одна:
-- доля работника × account_farm_mult(аккаунт).
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS yuplink.account_upgrade (
  account_id text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('farm', 'warehouse')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, kind)
);

-- Множитель ферм аккаунта: улучшены — 1.5 (FARM_UPGRADE_MULT), нет — 1.
CREATE OR REPLACE FUNCTION yuplink.account_farm_mult(p_account text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM yuplink.account_upgrade u
                            WHERE u.account_id = p_account AND u.kind = 'farm')
              THEN 1.5 ELSE 1 END::numeric
$function$;

-- Купить улучшение: 'ok' — куплено, 'already' — уже было (повтор — то же). Нет алмазов —
-- исключение upgrade.no_diamonds, ничего не записано.
CREATE OR REPLACE FUNCTION yuplink.account_upgrade_buy(p_account text, p_kind text, p_cost numeric)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_account IS NULL OR p_account = '' THEN RAISE EXCEPTION 'upgrade.no_account'; END IF;
  IF p_kind NOT IN ('farm', 'warehouse') THEN RAISE EXCEPTION 'upgrade.bad_kind'; END IF;
  IF p_cost IS NULL OR p_cost <= 0 THEN RAISE EXCEPTION 'upgrade.bad_cost'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('upg:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.account_upgrade WHERE account_id = p_account AND kind = p_kind) THEN
    RETURN 'already';
  END IF;
  BEGIN
    PERFORM yuplink.res_move(p_account, 'diamonds', -p_cost, 'account_upgrade',
                             'upg:' || p_kind || ':' || p_account);
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%в минус%' THEN RAISE EXCEPTION 'upgrade.no_diamonds'; END IF;
    RAISE;
  END;
  INSERT INTO yuplink.account_upgrade (account_id, kind) VALUES (p_account, p_kind);
  RETURN 'ok';
END $function$;

CREATE OR REPLACE FUNCTION yuplink.raid_field_settle(p_map text, p_q integer, p_r integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
                        + yuplink.raid_field_weather_dsec(p_map, since, now()), 0)/3600.0 * (v_yield / n)
             -- Улучшение ферм игрока (farm-01): +50 % к базе — его доля.
             * yuplink.account_farm_mult(raid_field_worker.account_id),
           since = now()
     WHERE map_id=p_map AND q=p_q AND r=p_r AND hero_id IS NOT NULL;
  ELSE
    -- Поле стоит: время не капает никому, но отрезок всё равно закрываем.
    UPDATE yuplink.raid_field_worker SET since = now()
     WHERE map_id=p_map AND q=p_q AND r=p_r;
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION yuplink.raid_field_pending(p_map text, p_q integer, p_r integer, p_account text)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
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
                              + yuplink.raid_field_weather_dsec(p_map, w.since, now()), 0)/3600.0 * (v_yield / n)
                              * yuplink.account_farm_mult(p_account);
    END IF;
  END IF;
  RETURN round(live, 6);
END; $function$;
