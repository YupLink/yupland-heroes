-- Волна 4: у активов появляется владелец-аккаунт.
-- Аддитивный шаг: колонка, бэкфилл и штамп на новых строках. Чтения ещё по
-- адресу — их переключает следующий коммит.
BEGIN;

ALTER TABLE yuplink.hero_instance ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE yuplink.user_game_item ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE yuplink.hallway_training_chips ADD COLUMN IF NOT EXISTS account_id text;

UPDATE yuplink.hero_instance SET account_id = yuplink.acc_of(wallet) WHERE account_id IS NULL;
UPDATE yuplink.user_game_item SET account_id = yuplink.acc_of(wallet) WHERE account_id IS NULL;
UPDATE yuplink.hallway_training_chips SET account_id = yuplink.acc_of(wallet) WHERE account_id IS NULL;

DROP TRIGGER IF EXISTS stamp_acc ON yuplink.hero_instance;
CREATE TRIGGER stamp_acc BEFORE INSERT OR UPDATE ON yuplink.hero_instance
  FOR EACH ROW EXECUTE FUNCTION yuplink.stamp_account_id();
DROP TRIGGER IF EXISTS stamp_acc ON yuplink.hallway_training_chips;
CREATE TRIGGER stamp_acc BEFORE INSERT OR UPDATE ON yuplink.hallway_training_chips
  FOR EACH ROW EXECUTE FUNCTION yuplink.stamp_account_id();

CREATE INDEX IF NOT EXISTS hero_instance_account_idx ON yuplink.hero_instance (account_id);
CREATE INDEX IF NOT EXISTS user_game_item_account_idx ON yuplink.user_game_item (account_id);
CREATE INDEX IF NOT EXISTS hallway_training_chips_account_idx ON yuplink.hallway_training_chips (account_id);

COMMIT;
