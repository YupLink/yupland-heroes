-- Лицензии банка на продажу золота за DARAI (владелец, 15.10.2026) — пока админам.
-- Ступени и цены — src/lib/bankLicense.ts, ручки — src/server/api/bank/bank-license.ts.
-- Покупка золота за DARAI лицензии не требует. Идемпотентно.
--
-- Текущая лицензия — одна строка на аккаунт; покупки — журнал (сумма оплат и есть
-- касса банка: DARAI ушли со счёта игрока и лежат за банком, а не «свободны»).
CREATE TABLE IF NOT EXISTS yuplink.bank_license (
  account_id text PRIMARY KEY,
  tier text NOT NULL,
  daily_limit numeric NOT NULL CHECK (daily_limit > 0),
  ends_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.bank_license_buy (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  tier text NOT NULL,
  days integer NOT NULL CHECK (days > 0),
  price numeric NOT NULL CHECK (price > 0),
  token text NOT NULL DEFAULT 'Darai',
  op_ref text NOT NULL UNIQUE,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_license_buy_acc ON yuplink.bank_license_buy (account_id, created_at DESC);

-- Покупка: под замком аккаунта. Та же ступень, ещё действует — продление с конца
-- текущей; иначе (другая ступень или истекла) — новая с этой минуты, прежняя
-- заканчивается. Оплата — acc_move (не в минус); повтор того же нажатия ничего
-- не списывает и возвращает applied=false.
CREATE OR REPLACE FUNCTION yuplink.bank_license_purchase(
  p_account text, p_tier text, p_limit numeric, p_price numeric, p_days integer, p_op text
)
RETURNS TABLE(tier text, daily_limit numeric, ends_at timestamptz, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_cur yuplink.bank_license%ROWTYPE; v_end timestamptz; v_paid boolean;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' OR p_tier IS NULL OR p_tier = ''
     OR p_limit IS NULL OR p_limit <= 0 OR p_price IS NULL OR p_price <= 0 OR p_days IS NULL OR p_days <= 0 THEN
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
  SELECT m.applied INTO v_paid FROM yuplink.acc_move(p_account, 'Darai', -p_price, 'acc_spend', 'banklic:' || p_op) m;
  IF NOT v_paid THEN RAISE EXCEPTION 'bank_license_op_reused'; END IF;
  INSERT INTO yuplink.bank_license(account_id, tier, daily_limit, ends_at, updated_at)
    VALUES (p_account, p_tier, p_limit, v_end, now())
    ON CONFLICT (account_id) DO UPDATE
      SET tier = EXCLUDED.tier, daily_limit = EXCLUDED.daily_limit, ends_at = EXCLUDED.ends_at, updated_at = now();
  INSERT INTO yuplink.bank_license_buy(id, account_id, tier, days, price, op_ref, ends_at)
    VALUES ('blb_' || substr(md5(p_op), 1, 16), p_account, p_tier, p_days, p_price, p_op, v_end);
  RETURN QUERY SELECT p_tier, p_limit, v_end, true;
END $fn$;
