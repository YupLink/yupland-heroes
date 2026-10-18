-- Ethereum-кошелёк и герои за NFT коллекции Heroes of Valdir (владелец, 17.10.2026).
-- Пока только админам. Кошелёк — расширение аккаунта (не вход), как Solana (sol-01).
-- За каждый NFT коллекции — один герой навсегда (по номеру токена, кто бы им ни владел):
-- Лириан — легендарный, остальные — редкий 90 % / эпический 10 %.

-- Привязка: одна на аккаунт, адрес уникален (антифарм), nonce — на 5 минут.
CREATE TABLE IF NOT EXISTS yuplink.eth_wallet (
  account_id  text PRIMARY KEY,
  address     text UNIQUE,
  nonce       text,
  nonce_at    timestamptz,
  verified_at timestamptz
);

-- Карточка токена коллекции: имя героя, картинка, Лириан ли (данные из tokenURI).
CREATE TABLE IF NOT EXISTS yuplink.eth_hov_token (
  token_id  integer PRIMARY KEY,
  hero_name text,
  image     text,
  rarity    text,
  lirian    boolean NOT NULL DEFAULT false,
  owner     text,
  owner_at  timestamptz
);
CREATE INDEX IF NOT EXISTS eth_hov_token_owner ON yuplink.eth_hov_token (owner);

-- Выданное за NFT: номер токена — ключ, второй раз за тот же NFT героя нет.
CREATE TABLE IF NOT EXISTS yuplink.eth_nft_claim (
  contract         text NOT NULL,
  token_id         integer NOT NULL,
  account_id       text NOT NULL,
  address          text NOT NULL,
  rarity           text,
  hero_template_id text,
  item_id          text,
  claimed_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contract, token_id)
);
CREATE INDEX IF NOT EXISTS eth_nft_claim_account ON yuplink.eth_nft_claim (account_id);
