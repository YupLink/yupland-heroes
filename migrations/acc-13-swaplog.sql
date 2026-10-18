-- Журнал смен героя в таверне: лимит суточных смен считается на игрока.
BEGIN;
ALTER TABLE yuplink.hero_swap_log ADD COLUMN IF NOT EXISTS account_id text;
UPDATE yuplink.hero_swap_log SET account_id = yuplink.acc_of(wallet) WHERE account_id IS NULL;
DROP TRIGGER IF EXISTS stamp_acc ON yuplink.hero_swap_log;
CREATE TRIGGER stamp_acc BEFORE INSERT OR UPDATE ON yuplink.hero_swap_log
  FOR EACH ROW EXECUTE FUNCTION yuplink.stamp_account_id();
CREATE INDEX IF NOT EXISTS hero_swap_log_account_idx ON yuplink.hero_swap_log (account_id, at DESC);
COMMIT;
