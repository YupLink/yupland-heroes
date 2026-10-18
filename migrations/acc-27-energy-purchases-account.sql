-- Покупки энергопаков — последняя таблица магазина без владельца-аккаунта.
-- Дневной лимит и ступень цены считались перебором адресов, а значит ломались
-- ровно там, ради чего затевался переезд: адрес вне users, иной регистр,
-- игрок без кошелька.
BEGIN;
ALTER TABLE yuplink.energy_pack_purchases ADD COLUMN IF NOT EXISTS account_id text;
UPDATE yuplink.energy_pack_purchases SET account_id = yuplink.acc_of(wallet)
 WHERE account_id IS NULL AND yuplink.acc_of(wallet) IS NOT NULL;
DROP TRIGGER IF EXISTS stamp_acc ON yuplink.energy_pack_purchases;
CREATE TRIGGER stamp_acc BEFORE INSERT OR UPDATE ON yuplink.energy_pack_purchases
  FOR EACH ROW EXECUTE FUNCTION yuplink.stamp_account_id();
CREATE INDEX IF NOT EXISTS energy_pack_purchases_account_idx
  ON yuplink.energy_pack_purchases (account_id, pack_id);
COMMIT;
