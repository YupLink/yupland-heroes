-- «Управление шахтами» (владелец, 25.10.2026): здание замка покупается в
-- Ратуше функцией castle_building_buy (townhall-01) — kind 'mine_office',
-- новых таблиц и функций не нужно. Эта миграция — только страховка «одно на
-- аккаунт» на уровне базы, как у Храма (castle_building_one_temple): потолок
-- вида p_max = 1 проверяет и сама функция под замком аккаунта, а индекс не
-- даст второго здания, даже если админ поднимет max в settings.townhall_config.
--
-- Порядок: в любой момент (код работает и без неё), лучше до кода. Повтор
-- безвреден (IF NOT EXISTS). На 25.10.2026 строк mine_office в базе нет.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE UNIQUE INDEX IF NOT EXISTS castle_building_one_mine_office
  ON yuplink.castle_building (account_id) WHERE kind = 'mine_office';

COMMIT;
