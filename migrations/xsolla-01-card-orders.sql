-- Оплата картой через Xsolla (владелец, 11.11.2026, ПРАВИЛА §8.127): только аккаунтам,
-- у которых единственный вход — Google. Товары — пакеты золота §8.66 и подписки
-- (SKU в кабинете Xsolla = наши id). Заказ пишется при создании оплаты; золото или
-- подписку выдаёт вебхук order_paid — один раз на заказ (ключ — номер заказа Xsolla).
-- Тестовый режим (sandbox): кнопка и выдача — только аккаунтам из
-- settings.xsolla_test_accounts (тестовая карта Xsolla денег не берёт).
BEGIN;

CREATE TABLE IF NOT EXISTS yuplink.xsolla_order (
  order_id    bigint PRIMARY KEY,
  account_id  text NOT NULL REFERENCES yuplink.accounts(id),
  sku         text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('gold', 'sub')),
  usd         numeric(12, 2) NOT NULL CHECK (usd > 0),
  sandbox     boolean NOT NULL,
  status      text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'canceled', 'ignored')),
  paid_amount text,
  paid_currency text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  paid_at     timestamptz,
  canceled_at timestamptz
);
CREATE INDEX IF NOT EXISTS xsolla_order_account ON yuplink.xsolla_order (account_id, created_at DESC);

-- Тестовый режим: аккаунт Google владельца (заведён им 29.10.2026).
INSERT INTO yuplink.settings (key, value)
VALUES ('xsolla_test_accounts', '["acc_tester_example00"]')
ON CONFLICT (key) DO NOTHING;

COMMIT;
