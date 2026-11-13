-- Индексатор NEAR, шаг 1б (02.11.2026): бесплатный neardata.xyz держит ~30 запросов в минуту при
-- ~107 блоках в минуту — читать все блоки нельзя. Опрашиваем историю своих адресов
-- (tx.main.fastnear.com) и разбираем только свои транзакции. Здесь — какие уже разобраны.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS yuplink.chain_tx_seen (
  hash         text PRIMARY KEY,
  account      text NOT NULL,             -- через чей адрес нашли
  block_height bigint NOT NULL,
  seen_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chain_tx_seen_acc ON yuplink.chain_tx_seen (account, block_height DESC);

-- Курсор потока блоков больше не нужен: курсоры — по адресам ('acct:<адрес>').
DELETE FROM yuplink.chain_cursor WHERE name = 'neardata';
