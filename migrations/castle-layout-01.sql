-- Расстановка замка — одна на аккаунт, общая для телефона и ПК (запрос Ангелины
-- 26.10.2026). Раньше жила только в localStorage устройства (castle-modular-layout-v1).
-- Ручки — src/server/api/castle-layout/* (getCastleLayout, saveCastleLayout).
--  · account_id — аккаунт проверенной сессии (игрок = аккаунт, не кошелёк);
--  · revision — номер записи: первая запись 1, каждая следующая +1 только поверх
--    той ревизии, что видел клиент (иначе конфликт, ничего не пишется);
--  · layout — массив объектов serializeModularLayout, проверенный сервером
--    (поля, пределы, права), до 256 КБ;
--  · updated_wallet — кошелёк сессии, сделавшей запись (для разбора, не владелец).
-- Нет строки = layout null, revision 0: сервер сам ничего не создаёт.
-- Идемпотентно (повторный прогон безвреден). Накатывать ДО кода: без таблицы
-- чтение и запись расстановки падают.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.castle_layout (
  account_id text PRIMARY KEY,
  revision bigint NOT NULL CHECK (revision >= 1),
  layout jsonb NOT NULL CHECK (jsonb_typeof(layout) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_wallet text
);

COMMIT;
