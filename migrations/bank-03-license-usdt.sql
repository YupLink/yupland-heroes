-- Лицензия банка — оплата DARAI или долларами (USDT со счёта), владелец 15.10.2026.
-- Та же функция, что в bank-02, плюс валюта оплаты p_token (по умолчанию DARAI —
-- старые вызовы работают как прежде). Касса — bank_license_buy.token: DARAI учтены
-- в раскладке пулов (darai-pools), USDT — в «свободно USDT» (token-free-pool).
BEGIN;

DROP FUNCTION IF EXISTS yuplink.bank_license_purchase(text, text, numeric, numeric, integer, text);

CREATE OR REPLACE FUNCTION yuplink.bank_license_purchase(
  p_account text, p_tier text, p_limit numeric, p_price numeric, p_days integer, p_op text,
  p_token text DEFAULT 'Darai'
)
RETURNS TABLE(tier text, daily_limit numeric, ends_at timestamptz, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_cur yuplink.bank_license%ROWTYPE; v_end timestamptz; v_paid boolean;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' OR p_tier IS NULL OR p_tier = ''
     OR p_limit IS NULL OR p_limit <= 0 OR p_price IS NULL OR p_price <= 0 OR p_days IS NULL OR p_days <= 0
     OR p_token NOT IN ('Darai', 'USDT') THEN
    RAISE EXCEPTION 'bank_license_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('banklic:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.bank_license_buy b WHERE b.op_ref = p_op) THEN
    RETURN QUERY SELECT l.tier, l.daily_limit, l.ends_at, false
      FROM yuplink.bank_license l WHERE l.account_id = p_account;
    RETURN;
  END IF;
  SELECT * INTO v_cur FROM yuplink.bank_license l WHERE l.account_id = p_account FOR UPDATE;
  IF FOUND AND v_cur.tier = p_tier AND v_cur.ends_at > now() THEN
    v_end := v_cur.ends_at + make_interval(days => p_days);
  ELSE
    v_end := now() + make_interval(days => p_days);
  END IF;
  SELECT m.applied INTO v_paid FROM yuplink.acc_move(p_account, p_token, -p_price, 'acc_spend', 'banklic:' || p_op) m;
  IF NOT v_paid THEN RAISE EXCEPTION 'bank_license_op_reused'; END IF;
  INSERT INTO yuplink.bank_license(account_id, tier, daily_limit, ends_at, updated_at)
    VALUES (p_account, p_tier, p_limit, v_end, now())
    ON CONFLICT (account_id) DO UPDATE
      SET tier = EXCLUDED.tier, daily_limit = EXCLUDED.daily_limit, ends_at = EXCLUDED.ends_at, updated_at = now();
  INSERT INTO yuplink.bank_license_buy(id, account_id, tier, days, price, token, op_ref, ends_at)
    VALUES ('blb_' || substr(md5(p_op), 1, 16), p_account, p_tier, p_days, p_price, p_token, p_op, v_end);
  RETURN QUERY SELECT p_tier, p_limit, v_end, true;
END $fn$;

COMMIT;
