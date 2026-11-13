-- Пулы банка с любыми монетами (владелец, 25.10.2026: «пулы с Хопой, Пэл, ГП,
-- Голдендараем, РФ — считай все… звёзды, USDT… на выбор к паре всего, что есть»).
-- Идемпотентно. Код — src/lib/castleBank.ts, src/lib/bankSwap.ts, src/server/api/bank/*.
--
-- Сторона пула — ресурс игры (золото, дерево, камень, алмазы) или любая монета счёта
-- (reward_tokens: DARAI, USDT, STARS, HOPE, GP, GDarai, RF, Pollen…). Пара — любая.
-- Наполнение: ресурс выпускает игра (как раньше), монету — только со счёта админа:
-- настоящие монеты из воздуха не берутся. Знаков после запятой: ресурс — 4, монета —
-- как у самой монеты, но не больше 8 (DARAI — 8, как было; USDT — 6; GP, STARS — 0).
-- Комиссия: 20 % — в пул карты только у DARAI и ресурсов (как было); у прочих монет
-- пула карты нет — комиссия целиком остаётся в самом пуле.
BEGIN;

ALTER TABLE yuplink.bank_pool DROP CONSTRAINT IF EXISTS bank_pool_check1; -- только 5 токенов
ALTER TABLE yuplink.bank_pool DROP CONSTRAINT IF EXISTS bank_pool_check2; -- DARAI только с золотом

CREATE OR REPLACE FUNCTION yuplink.bank_is_resource(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$ SELECT p IN ('gold', 'wood', 'stone', 'diamonds') $fn$;

-- Знаков после запятой у стороны пула; NULL — такой монеты нет.
CREATE OR REPLACE FUNCTION yuplink.bank_token_dp(p text) RETURNS integer
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN yuplink.bank_is_resource(p) THEN 4
              ELSE (SELECT LEAST(8, GREATEST(0, t.decimals)) FROM yuplink.reward_tokens t WHERE t.symbol = p) END
$fn$;

CREATE OR REPLACE FUNCTION yuplink.bank_pool_token_guard() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF yuplink.bank_token_dp(NEW.token_a) IS NULL THEN RAISE EXCEPTION 'bank_unknown_token:%', NEW.token_a; END IF;
  IF yuplink.bank_token_dp(NEW.token_b) IS NULL THEN RAISE EXCEPTION 'bank_unknown_token:%', NEW.token_b; END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS bank_pool_token_guard ON yuplink.bank_pool;
CREATE TRIGGER bank_pool_token_guard BEFORE INSERT OR UPDATE OF token_a, token_b ON yuplink.bank_pool
  FOR EACH ROW EXECUTE FUNCTION yuplink.bank_pool_token_guard();

-- Списать/зачислить сторону пула у аккаунта: ресурс — res_move, монета — счёт (acc_move).
CREATE OR REPLACE FUNCTION yuplink.bank_move(p_account text, p_token text, p_delta numeric, p_ref text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_ok boolean;
BEGIN
  IF yuplink.bank_is_resource(p_token) THEN
    SELECT m.applied INTO v_ok FROM yuplink.res_move(p_account, p_token, p_delta, 'bank_swap', p_ref) m;
  ELSE
    SELECT m.applied INTO v_ok FROM yuplink.acc_move(p_account, p_token, p_delta,
      CASE WHEN p_delta < 0 THEN 'acc_spend' ELSE 'acc_reward' END, p_ref) m;
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'bank_ref_reused:%', p_ref; END IF;
END $fn$;

-- Наполнение: монета — со счёта админа, ресурс — выпуск игры (без списания).
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
  IF NOT yuplink.bank_is_resource(p.token_a) THEN PERFORM yuplink.bank_move(p_account, p.token_a, -p_a, 'bankfund:' || p_op || ':a'); END IF;
  IF NOT yuplink.bank_is_resource(p.token_b) THEN PERFORM yuplink.bank_move(p_account, p.token_b, -p_b, 'bankfund:' || p_op || ':b'); END IF;
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
        v_dp_in integer; v_dp_out integer; v_to_map boolean; s yuplink.bank_swap%ROWTYPE;
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
  -- Знаки: ресурс — 4 (account_resources numeric(20,4)), монета — как у монеты, ≤ 8.
  v_dp_in := yuplink.bank_token_dp(p_token_in);
  v_dp_out := yuplink.bank_token_dp(v_out_tok);
  IF v_dp_in IS NULL OR v_dp_out IS NULL THEN RAISE EXCEPTION 'bank_unknown_token:%', p_token_in; END IF;
  IF p_amount <> round(p_amount, v_dp_in) THEN RAISE EXCEPTION 'bank_swap_bad_args'; END IF;
  -- Пул карты есть только у DARAI и ресурсов: у прочих монет комиссия вся остаётся в пуле.
  v_to_map := p_token_in = 'Darai' OR yuplink.bank_is_resource(p_token_in);
  v_fee := round(p_amount * p.fee_pct / 100, v_dp_in);
  v_fee_map := CASE WHEN v_to_map THEN round(v_fee * 0.2, v_dp_in) ELSE 0 END;
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
