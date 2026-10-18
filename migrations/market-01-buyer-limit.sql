-- Лимит покупок товара на игрока (задачник 23.09: «например, не более одного
-- артефакта»). Накатывать ДО кода: новый код читает per_account_limit.
--
-- per_account_limit — сколько штук одной позиции может купить один аккаунт
-- (NULL — без лимита). raid_market_buyer — сколько он уже купил: резерв
-- поднимается одним оператором с проверкой лимита ДО денег, как запас
-- (market-stock), недоданное возвращается. Внешнего ключа нет намеренно:
-- каскад на маркете уже однажды стоил абуза (knowledge: CASCADE на маркете),
-- а строки удалённой позиции никому не мешают.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_market_item
  ADD COLUMN IF NOT EXISTS per_account_limit integer
    CHECK (per_account_limit IS NULL OR per_account_limit >= 1);

CREATE TABLE IF NOT EXISTS yuplink.raid_market_buyer (
  item_id    text        NOT NULL,
  account_id text        NOT NULL,
  bought     integer     NOT NULL DEFAULT 0 CHECK (bought >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, account_id)
);

COMMIT;
