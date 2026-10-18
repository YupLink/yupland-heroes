-- Захват мистик-бокса при открытии: владелец — аккаунт.
-- Список адресов остаётся в сигнатуре ради совместимости вызова и больше ни
-- на что не влияет: бокс числится за аккаунтом, а не за адресом выдачи.
BEGIN;
CREATE OR REPLACE FUNCTION yuplink.capture_mystic_grant(
  p_pack text, p_wallets text[], p_account text DEFAULT NULL)
RETURNS TABLE(gid text)
LANGUAGE plpgsql AS $fn$
DECLARE v_id text; v_acc text;
BEGIN
  v_acc := COALESCE(p_account, yuplink.acc_of(p_wallets[1]));
  IF v_acc IS NULL THEN RETURN; END IF;
  UPDATE yuplink.chip_pack_grants SET opened_at = now()
  WHERE id = (
    SELECT id FROM yuplink.chip_pack_grants
    WHERE chip_pack_id = p_pack AND account_id = v_acc AND opened_at IS NULL
    ORDER BY granted_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN QUERY SELECT v_id; END IF;
END $fn$;
COMMIT;
