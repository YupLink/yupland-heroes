-- «Метеостанция» (владелец, 28.10.2026): здание замка покупается в Ратуше
-- функцией castle_building_buy (townhall-01) — kind 'weather_station', новых
-- таблиц и функций не нужно. Эта миграция — только страховка «одна на
-- аккаунт» на уровне базы, как у «Управления шахтами» (mine-mgmt-01): потолок
-- вида p_max = 1 проверяет и сама функция под замком аккаунта, а индекс не
-- даст второго здания, даже если админ поднимет max в settings.townhall_config.
--
-- Порядок: в любой момент (код работает и без неё), лучше до кода. Повтор
-- безвреден (IF NOT EXISTS). На 28.10.2026 строк weather_station в базе нет.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE UNIQUE INDEX IF NOT EXISTS castle_building_one_weather_station
  ON yuplink.castle_building (account_id) WHERE kind = 'weather_station';

COMMIT;
