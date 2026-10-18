-- Лимит покупок на игрока — В ДЕНЬ (владелец 04.10.2026: «лимит в день вообще
-- нужно обозначить, иначе больше какого-то количества купить невозможно»).
-- Накатывать ДО кода: новый код пишет и читает колонку day.
--
-- Счётчик купленного теперь по суткам UTC (как остальные суточные вещи
-- игры): (позиция, аккаунт, день). Новые сутки — новая строка, лимит снова
-- целый. На 04.10 позиций с лимитом 0 и строк счётчика 0, так что прежний код
-- (ключ без дня) до выката в этот путь не заходит.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_market_buyer
  ADD COLUMN IF NOT EXISTS day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date);

ALTER TABLE yuplink.raid_market_buyer DROP CONSTRAINT IF EXISTS raid_market_buyer_pkey;
ALTER TABLE yuplink.raid_market_buyer ADD PRIMARY KEY (item_id, account_id, day);

COMMIT;
