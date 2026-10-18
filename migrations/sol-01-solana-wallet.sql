-- Привязка Solana-кошелька к аккаунту (Phantom в Казне, 09.10.2026).
-- Раньше таблицу создавал сам код при первом вызове после каждого запуска
-- (server/api/solana/link.ts, ensureSchema), а сбой индекса глотался молча —
-- терялась проверка «один кошелёк — один аккаунт». Теперь схема — здесь.
-- На проде уже есть ровно в этом виде: прогон ничего не меняет.

CREATE TABLE IF NOT EXISTS yuplink.solana_wallet (
  account_id text PRIMARY KEY,
  address text,
  verified_at timestamptz,
  nonce text,
  nonce_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Один адрес — один аккаунт (антифарм): у отвязанных address = NULL.
CREATE UNIQUE INDEX IF NOT EXISTS solana_wallet_address_uq
  ON yuplink.solana_wallet (address) WHERE address IS NOT NULL;
