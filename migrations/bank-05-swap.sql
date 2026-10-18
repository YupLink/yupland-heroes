-- Обмен в банке (владелец, 16.10.2026) — пока только админам. Код — src/lib/bankSwap.ts
-- (формула), src/server/api/bank/bank-swap.ts (ручки). Идемпотентно.
--
-- Формула пула: запас A × запас B = const. Комиссия пула (fee_pct, 10 %) берётся с
-- того, что игрок отдаёт: по курсу меняется остаток, из комиссии 80 % остаётся в
-- пуле (растёт ликвидность), 20 % — в пул карты (DARAI — darai_pool_move, ресурсы —
-- map_resource_pool). Продать золото за DARAI — только с лицензией и в пределах её
-- суточного лимита (скользящие 24 ч); купить золото за DARAI и прочие пулы — без.
BEGIN;

-- Пул карты для ресурсов: доля комиссии банка в золоте, дереве, камне, алмазах.
CREATE TABLE IF NOT EXISTS yuplink.map_resource_pool (
  id text PRIMARY KEY,
  resource text NOT NULL CHECK (resource IN ('gold', 'wood', 'stone', 'diamonds')),
  amount numeric NOT NULL,
  kind text NOT NULL,
  ref text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Журнал наполнения и обменов.
CREATE TABLE IF NOT EXISTS yuplink.bank_pool_fund (
  id text PRIMARY KEY,
  pool_id text NOT NULL,
  account_id text NOT NULL,
  amount_a numeric NOT NULL CHECK (amount_a > 0),
  amount_b numeric NOT NULL CHECK (amount_b > 0),
  op_ref text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.bank_swap (
  id text PRIMARY KEY,
  pool_id text NOT NULL,
  account_id text NOT NULL,
  token_in text NOT NULL,
  amount_in numeric NOT NULL CHECK (amount_in > 0),
  fee_pool numeric NOT NULL,
  fee_map numeric NOT NULL,
  token_out text NOT NULL,
  amount_out numeric NOT NULL CHECK (amount_out > 0),
  op_ref text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_swap_sell_gold ON yuplink.bank_swap (account_id, created_at)
  WHERE token_in = 'gold' AND token_out = 'Darai';

-- Списать/зачислить сторону пула у аккаунта: DARAI — счёт (acc_move), ресурс — res_move.
CREATE OR REPLACE FUNCTION yuplink.bank_move(p_account text, p_token text, p_delta numeric, p_ref text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_ok boolean;
BEGIN
  IF p_token = 'Darai' THEN
    SELECT m.applied INTO v_ok FROM yuplink.acc_move(p_account, 'Darai', p_delta,
      CASE WHEN p_delta < 0 THEN 'acc_spend' ELSE 'acc_reward' END, p_ref) m;
  ELSE
    SELECT m.applied INTO v_ok FROM yuplink.res_move(p_account, p_token, p_delta, 'bank_swap', p_ref) m;
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'bank_ref_reused:%', p_ref; END IF;
END $fn$;

-- Наполнение: сторона DARAI — со счёта админа, ресурс — выпуск игры (без списания).
-- Пропорцию (по стартовому курсу или по запасам) считает сервер.
CREATE OR REPLACE FUNCTION yuplink.bank_pool_fund(p_pool text, p_account text, p_a numeric, p_b numeric, p_op text)
RETURNS TABLE(reserve_a numeric, reserve_b numeric, applied boolean)
LANGUAGE plpgsql AS $fn$
#variable_conflict use_column
DECLARE p yuplink.bank_pool%ROWTYPE;
BEGIN
  IF p_a IS NULL OR p_a <= 0 OR p_b IS NULL OR p_b <= 0 OR p_op IS NULL OR p_op = '' THEN
    RAISE EXCEPTION 'bank_fund_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bankpool:' || p_pool));
  SELECT * INTO p FROM yuplink.bank_pool WHERE id = p_pool FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank_pool_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM yuplink.bank_pool_fund WHERE op_ref = p_op) THEN
    RETURN QUERY SELECT p.reserve_a, p.reserve_b, false; RETURN;
  END IF;
  IF p.token_a = 'Darai' THEN PERFORM yuplink.bank_move(p_account, 'Darai', -p_a, 'bankfund:' || p_op || ':a'); END IF;
  IF p.token_b = 'Darai' THEN PERFORM yuplink.bank_move(p_account, 'Darai', -p_b, 'bankfund:' || p_op || ':b'); END IF;
  UPDATE yuplink.bank_pool SET reserve_a = reserve_a + p_a, reserve_b = reserve_b + p_b WHERE id = p.id RETURNING * INTO p;
  INSERT INTO yuplink.bank_pool_fund(id, pool_id, account_id, amount_a, amount_b, op_ref)
    VALUES ('bpf_' || substr(md5(p_op), 1, 16), p.id, p_account, p_a, p_b, p_op);
  RETURN QUERY SELECT p.reserve_a, p.reserve_b, true;
END $fn$;

-- Обмен. p_limit — суточный лимит продажи золота за DARAI по лицензии (NULL — лицензии нет).
CREATE OR REPLACE FUNCTION yuplink.bank_swap_run(
  p_pool text, p_account text, p_token_in text, p_amount numeric, p_min_out numeric, p_op text, p_limit numeric
)
RETURNS TABLE(amount_out numeric, fee_pool numeric, fee_map numeric, reserve_a numeric, reserve_b numeric, applied boolean)
LANGUAGE plpgsql AS $fn$
#variable_conflict use_column
DECLARE p yuplink.bank_pool%ROWTYPE; v_in_a boolean; v_out_tok text; r_in numeric; r_out numeric;
        v_fee numeric; v_fee_map numeric; v_fee_pool numeric; v_net numeric; v_out numeric; v_sold numeric;
        v_dp_in integer; v_dp_out integer; s yuplink.bank_swap%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'bank_swap_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bankpool:' || p_pool));
  SELECT * INTO s FROM yuplink.bank_swap WHERE op_ref = p_op;
  IF FOUND THEN
    SELECT * INTO p FROM yuplink.bank_pool WHERE id = s.pool_id;
    RETURN QUERY SELECT s.amount_out, s.fee_pool, s.fee_map, p.reserve_a, p.reserve_b, false; RETURN;
  END IF;
  SELECT * INTO p FROM yuplink.bank_pool WHERE id = p_pool FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank_pool_not_found'; END IF;
  IF p_token_in = p.token_a THEN v_in_a := true; v_out_tok := p.token_b; r_in := p.reserve_a; r_out := p.reserve_b;
  ELSIF p_token_in = p.token_b THEN v_in_a := false; v_out_tok := p.token_a; r_in := p.reserve_b; r_out := p.reserve_a;
  ELSE RAISE EXCEPTION 'bank_swap_wrong_token'; END IF;
  IF r_in <= 0 OR r_out <= 0 THEN RAISE EXCEPTION 'bank_pool_empty'; END IF;
  IF p_token_in = 'gold' AND v_out_tok = 'Darai' THEN
    IF p_limit IS NULL THEN RAISE EXCEPTION 'bank_license_required'; END IF;
    SELECT COALESCE(sum(b.amount_in), 0) INTO v_sold FROM yuplink.bank_swap b
     WHERE b.account_id = p_account AND b.token_in = 'gold' AND b.token_out = 'Darai'
       AND b.created_at > now() - interval '24 hours';
    IF v_sold + p_amount > p_limit THEN RAISE EXCEPTION 'bank_license_limit:%:%', v_sold, p_limit; END IF;
  END IF;
  -- Знаки как в журналах: DARAI — 8, ресурсы — 4 (account_resources numeric(20,4)).
  v_dp_in := CASE WHEN p_token_in = 'Darai' THEN 8 ELSE 4 END;
  v_dp_out := CASE WHEN v_out_tok = 'Darai' THEN 8 ELSE 4 END;
  IF p_amount <> round(p_amount, v_dp_in) THEN RAISE EXCEPTION 'bank_swap_bad_args'; END IF;
  v_fee := round(p_amount * p.fee_pct / 100, v_dp_in);
  v_fee_map := round(v_fee * 0.2, v_dp_in);
  v_fee_pool := v_fee - v_fee_map;
  v_net := p_amount - v_fee;
  v_out := trunc(r_out * v_net / (r_in + v_net), v_dp_out);
  IF v_out <= 0 OR v_out >= r_out THEN RAISE EXCEPTION 'bank_swap_too_small'; END IF;
  IF v_out < COALESCE(p_min_out, 0) THEN RAISE EXCEPTION 'bank_swap_slippage:%', v_out; END IF;
  PERFORM yuplink.bank_move(p_account, p_token_in, -p_amount, 'bankswap:' || p_op || ':in');
  PERFORM yuplink.bank_move(p_account, v_out_tok, v_out, 'bankswap:' || p_op || ':out');
  IF v_in_a THEN
    UPDATE yuplink.bank_pool SET reserve_a = reserve_a + v_net + v_fee_pool, reserve_b = reserve_b - v_out WHERE id = p.id RETURNING * INTO p;
  ELSE
    UPDATE yuplink.bank_pool SET reserve_b = reserve_b + v_net + v_fee_pool, reserve_a = reserve_a - v_out WHERE id = p.id RETURNING * INTO p;
  END IF;
  IF v_fee_map > 0 THEN
    IF p_token_in = 'Darai' THEN
      INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note, op_id)
        VALUES ('dp_bs_' || substr(md5(p_op), 1, 16), 'map', 'player_spend', v_fee_map,
                'bankswap:' || p_op || ':map', 'банк: 20 % комиссии обмена', 'bankswap');
    ELSE
      INSERT INTO yuplink.map_resource_pool (id, resource, amount, kind, ref)
        VALUES ('mrp_' || substr(md5(p_op), 1, 16), p_token_in, v_fee_map, 'bank_fee', 'bankswap:' || p_op || ':map');
    END IF;
  END IF;
  INSERT INTO yuplink.bank_swap(id, pool_id, account_id, token_in, amount_in, fee_pool, fee_map, token_out, amount_out, op_ref)
    VALUES ('bs_' || substr(md5(p_op), 1, 16), p.id, p_account, p_token_in, p_amount, v_fee_pool, v_fee_map, v_out_tok, v_out, p_op);
  RETURN QUERY SELECT v_out, v_fee_pool, v_fee_map, p.reserve_a, p.reserve_b, true;
END $fn$;

COMMIT;
