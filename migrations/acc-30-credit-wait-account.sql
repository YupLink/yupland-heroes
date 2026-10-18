-- Старые ожидания зачисления без владельца: проставляем аккаунт по адресу,
-- иначе игрок не увидит уведомление, а крон не свяжет строку с игроком.
UPDATE yuplink.credit_wait SET account_id = yuplink.acc_of(wallet)
 WHERE account_id IS NULL AND yuplink.acc_of(wallet) IS NOT NULL;
DROP TRIGGER IF EXISTS stamp_acc ON yuplink.credit_wait;
CREATE TRIGGER stamp_acc BEFORE INSERT OR UPDATE ON yuplink.credit_wait
  FOR EACH ROW EXECUTE FUNCTION yuplink.stamp_account_id();
