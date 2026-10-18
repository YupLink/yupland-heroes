-- Три листинга успели родиться в окне между миграцией и выкаткой кода, поэтому
-- остались без аккаунта. Дозаполняем и ставим штамп, чтобы впредь колонку
-- заполняла сама база — на случай любого пути записи мимо приложения.
BEGIN;

UPDATE yuplink.chip_market_listings
   SET seller_account = COALESCE(seller_account, yuplink.acc_of(seller_wallet)),
       buyer_account  = COALESCE(buyer_account,  yuplink.acc_of(buyer_wallet))
 WHERE seller_account IS NULL OR (buyer_wallet IS NOT NULL AND buyer_account IS NULL);

CREATE OR REPLACE FUNCTION yuplink.stamp_market_accounts() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.seller_account IS NULL AND NEW.seller_wallet IS NOT NULL THEN
    NEW.seller_account := yuplink.acc_of(NEW.seller_wallet);
  END IF;
  IF NEW.buyer_account IS NULL AND NEW.buyer_wallet IS NOT NULL THEN
    NEW.buyer_account := yuplink.acc_of(NEW.buyer_wallet);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS stamp_market_acc ON yuplink.chip_market_listings;
CREATE TRIGGER stamp_market_acc BEFORE INSERT OR UPDATE ON yuplink.chip_market_listings
  FOR EACH ROW EXECUTE FUNCTION yuplink.stamp_market_accounts();

COMMIT;
