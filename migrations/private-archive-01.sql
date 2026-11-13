-- Данные игроков — не в репозитории (владелец, 11.11.2026: «прод есть прод, такие
-- вещи нужно выводить в БД»; код готовят к открытию). Разовые сверки (audit/*.csv),
-- скрипты под конкретных игроков и миграции со списками аккаунтов переезжают сюда
-- целиком: путь в репозитории → содержимое. В коде их больше нет.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS yuplink.private_archive (
  path        text PRIMARY KEY,
  kind        text NOT NULL,
  content     text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE yuplink.private_archive IS
  'Файлы с данными игроков, вынесенные из репозитория (11.11.2026)';
COMMIT;
