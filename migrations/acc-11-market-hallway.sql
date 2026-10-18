-- Волна 5: маркет фишек, PvP и прихожая получают владельца-аккаунт.
BEGIN;

ALTER TABLE yuplink.chip_market_listings ADD COLUMN IF NOT EXISTS seller_account text;
ALTER TABLE yuplink.chip_market_listings ADD COLUMN IF NOT EXISTS buyer_account text;
UPDATE yuplink.chip_market_listings
   SET seller_account = COALESCE(seller_account, yuplink.acc_of(seller_wallet)),
       buyer_account  = COALESCE(buyer_account,  yuplink.acc_of(buyer_wallet))
 WHERE seller_account IS NULL OR (buyer_wallet IS NOT NULL AND buyer_account IS NULL);
CREATE INDEX IF NOT EXISTS chip_market_listings_seller_acc_idx
  ON yuplink.chip_market_listings (seller_account);

ALTER TABLE yuplink.chip_pvp_battles ADD COLUMN IF NOT EXISTS creator_account text;
ALTER TABLE yuplink.chip_pvp_battles ADD COLUMN IF NOT EXISTS opponent_account text;
UPDATE yuplink.chip_pvp_battles
   SET creator_account = COALESCE(creator_account, yuplink.acc_of(creator_wallet)),
       opponent_account = COALESCE(opponent_account, yuplink.acc_of(opponent_wallet))
 WHERE creator_account IS NULL OR (opponent_wallet IS NOT NULL AND opponent_account IS NULL);
CREATE INDEX IF NOT EXISTS chip_pvp_battles_creator_acc_idx
  ON yuplink.chip_pvp_battles (creator_account);

-- Юпик прихожей: у игрока он один, ключ — аккаунт.
UPDATE yuplink.hallway_yupiks SET account_id = yuplink.acc_of(wallet)
 WHERE account_id IS NULL AND yuplink.acc_of(wallet) IS NOT NULL;
CREATE INDEX IF NOT EXISTS hallway_yupiks_account_idx ON yuplink.hallway_yupiks (account_id);

COMMIT;
