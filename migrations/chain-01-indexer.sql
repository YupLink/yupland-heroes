-- Свой индексатор блокчейна NEAR (владелец, 02.11.2026: «делай — свой индексатор вместо Sendler,
-- без подписок»). Читает каждый финальный блок из бесплатного neardata.xyz (server/chain) и пишет
-- сюда переводы, которые касаются наших кошельков, и все события наших NFT-контрактов.
-- Шаг 1 — «в тени»: пишет и сверяется с Sendler; деньги по-прежнему проверяет Sendler.
SET lock_timeout = '3s';

-- Докуда дочитано: имя потока → высота блока и его время.
CREATE TABLE IF NOT EXISTS yuplink.chain_cursor (
  name       text PRIMARY KEY,
  height     bigint NOT NULL,
  block_at   timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Переводы токенов (NEP-141: события и старые строки «Transfer N from A to B» контрактов tkn.near),
-- где отправитель или получатель — наш кошелёк. Сумма — в мельчайших единицах (как в сети).
CREATE TABLE IF NOT EXISTS yuplink.chain_ft (
  id           text PRIMARY KEY,           -- receipt_id:номер записи в чеке
  block_height bigint NOT NULL,
  block_at     timestamptz NOT NULL,
  tx_hash      text,
  receipt_id   text NOT NULL,
  token        text NOT NULL,              -- контракт токена
  kind         text NOT NULL CHECK (kind IN ('transfer', 'refund', 'mint', 'burn')),
  from_id      text,
  to_id        text,
  amount       numeric(40,0) NOT NULL CHECK (amount >= 0),
  memo         text
);
CREATE INDEX IF NOT EXISTS chain_ft_to   ON yuplink.chain_ft (to_id, token, block_at DESC);
CREATE INDEX IF NOT EXISTS chain_ft_from ON yuplink.chain_ft (from_id, token, block_at DESC);
CREATE INDEX IF NOT EXISTS chain_ft_tx   ON yuplink.chain_ft (tx_hash);

-- События наших NFT-контрактов (NEP-171) — все: из них собирается «у кого какая NFT».
CREATE TABLE IF NOT EXISTS yuplink.chain_nft (
  id           text PRIMARY KEY,           -- receipt_id:номер записи:token_id
  block_height bigint NOT NULL,
  block_at     timestamptz NOT NULL,
  tx_hash      text,
  receipt_id   text NOT NULL,
  contract     text NOT NULL,
  event        text NOT NULL CHECK (event IN ('mint', 'transfer', 'burn')),
  token_id     text NOT NULL,
  from_id      text,
  to_id        text,
  memo         text
);
CREATE INDEX IF NOT EXISTS chain_nft_token ON yuplink.chain_nft (contract, token_id, block_height);
CREATE INDEX IF NOT EXISTS chain_nft_to    ON yuplink.chain_nft (to_id, block_at DESC);
CREATE INDEX IF NOT EXISTS chain_nft_from  ON yuplink.chain_nft (from_id, block_at DESC);
CREATE INDEX IF NOT EXISTS chain_nft_tx    ON yuplink.chain_nft (tx_hash);
