-- Наполнение пулов банка с основного кошелька игры (владелец, 29.10.2026: «мои балансы
-- не трожь — сказали пополнить, значит пополни пул! … с основного кошелька и учитывай
-- всё»). Идемпотентно (CREATE OR REPLACE). Код — src/server/api/bank/bank-swap.ts,
-- bank-fund-cover.ts.
--
-- Монетная сторона пула (DARAI, USDT, GP, GDarai…) больше НЕ списывается со счёта админа
-- (bank_move): монеты лежат на основном кошельке игры (плательщик, NEAR_SIGNER_ACCOUNT_ID).
-- Хватает ли — проверяет сервер ДО вызова: «свободно» по монете (token-free-pool: на
-- кошельке − счета игроков − награды − карта − выводы − уже чьё-то, куда входят запасы
-- всех пулов банка) ≥ сумма. Ресурсную сторону (золото, дерево…) выпускает игра, как в
-- bank_pool_fund. Счёт в журнале — 'wallet:<кошелёк>'. Повтор с тем же op_ref ничего не
-- меняет. Старая bank_pool_fund остаётся как была (новый код её не зовёт).
BEGIN;

CREATE OR REPLACE FUNCTION yuplink.bank_pool_fund_main(
  p_pool text, p_wallet text, p_a numeric, p_b numeric, p_op text)
RETURNS TABLE(reserve_a numeric, reserve_b numeric, applied boolean)
LANGUAGE plpgsql AS $fn$
#variable_conflict use_column
DECLARE p yuplink.bank_pool%ROWTYPE;
BEGIN
  IF p_a IS NULL OR p_a <= 0 OR p_b IS NULL OR p_b <= 0 OR p_op IS NULL OR p_op = ''
     OR p_wallet IS NULL OR p_wallet !~ '^[a-z0-9._-]{2,64}$' THEN
    RAISE EXCEPTION 'bank_fund_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bankpool:' || p_pool));
  SELECT * INTO p FROM yuplink.bank_pool WHERE id = p_pool FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank_pool_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM yuplink.bank_pool_fund WHERE op_ref = p_op) THEN
    RETURN QUERY SELECT p.reserve_a, p.reserve_b, false; RETURN;
  END IF;
  -- ни bank_move, ни acc_move: монеты — с кошелька игры, ресурсы — выпуск игры
  UPDATE yuplink.bank_pool SET reserve_a = reserve_a + p_a, reserve_b = reserve_b + p_b
   WHERE id = p.id RETURNING * INTO p;
  INSERT INTO yuplink.bank_pool_fund(id, pool_id, account_id, amount_a, amount_b, op_ref)
    VALUES ('bpf_' || substr(md5(p_op), 1, 16), p.id, 'wallet:' || p_wallet, p_a, p_b, p_op);
  RETURN QUERY SELECT p.reserve_a, p.reserve_b, true;
END $fn$;

COMMIT;
