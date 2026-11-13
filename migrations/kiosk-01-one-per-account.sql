-- «Газетный киоск» (Ангелина, 30.10.2026): здание замка покупается в Ратуше
-- функцией castle_building_buy (townhall-01) — kind 'newspaper_kiosk', новых
-- таблиц и функций не нужно. Эта миграция — только страховка «один на
-- аккаунт» на уровне базы, как у «Метеостанции» (wstation-01): потолок вида
-- p_max = 1 проверяет и сама функция под замком аккаунта, а индекс не даст
-- второго киоска, даже если админ поднимет max в settings.townhall_config.
--
-- Порядок: в любой момент (код работает и без неё), лучше до кода. Повтор
-- безвреден (IF NOT EXISTS). На 30.10.2026 строк newspaper_kiosk в базе нет.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE UNIQUE INDEX IF NOT EXISTS castle_building_one_newspaper_kiosk
  ON yuplink.castle_building (account_id) WHERE kind = 'newspaper_kiosk';

COMMIT;
