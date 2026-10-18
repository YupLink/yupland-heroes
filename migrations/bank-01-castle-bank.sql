-- Банк замка (владелец, 14.10.2026) — пока только админам. Правила и цена —
-- src/lib/castleBank.ts, ручки — src/server/api/bank/*. Идемпотентно.
--
-- 1) Постройка за ресурсы (как казино): одна запись на аккаунт. Потом она же —
--    лицензия на продажу золота за DARAI.
CREATE TABLE IF NOT EXISTS yuplink.castle_bank (
  account_id text PRIMARY KEY,
  built_at timestamptz NOT NULL DEFAULT now(),
  op_id text NOT NULL,
  cost jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Под замком аккаунта; уже построено — ничего не списываем (повтор нажатия
-- безвреден); ресурсы — res_move (не в минус) с ключами по p_op.
CREATE OR REPLACE FUNCTION yuplink.castle_bank_build(p_account text, p_cost jsonb, p_op text)
RETURNS TABLE(built boolean, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_res text; v_amt numeric; v_moved boolean;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN
    RAISE EXCEPTION 'bank_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('castlebank:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.castle_bank c WHERE c.account_id = p_account) THEN
    RETURN QUERY SELECT true, false; RETURN;
  END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'bank_bad_cost'; END IF;
    IF v_amt > 0 THEN
      SELECT m.applied INTO v_moved FROM yuplink.res_move(p_account, v_res, -v_amt, 'castle_bank', 'castlebank:' || p_op || ':' || v_res) m;
      -- Ключ уже был — ресурс не списан: постройку не засчитываем бесплатно.
      IF NOT v_moved THEN RAISE EXCEPTION 'bank_op_reused'; END IF;
    END IF;
  END LOOP;
  INSERT INTO yuplink.castle_bank(account_id, op_id, cost) VALUES (p_account, p_op, p_cost);
  RETURN QUERY SELECT true, true;
END $fn$;

-- 2) Пулы обмена. Админ заводит пару и стартовый курс: weight_a единиц A =
--    weight_b единиц B. Запас (reserve_*) пока ноль — наполнение позже.
--    DARAI — только в паре с золотом; одна пара — один пул (в любом порядке).
CREATE TABLE IF NOT EXISTS yuplink.bank_pool (
  id text PRIMARY KEY,
  token_a text NOT NULL,
  token_b text NOT NULL,
  weight_a numeric NOT NULL CHECK (weight_a > 0),
  weight_b numeric NOT NULL CHECK (weight_b > 0),
  reserve_a numeric NOT NULL DEFAULT 0 CHECK (reserve_a >= 0),
  reserve_b numeric NOT NULL DEFAULT 0 CHECK (reserve_b >= 0),
  fee_pct numeric NOT NULL DEFAULT 10 CHECK (fee_pct >= 0 AND fee_pct < 100),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (token_a <> token_b),
  CHECK (token_a IN ('gold','wood','stone','diamonds','Darai')
     AND token_b IN ('gold','wood','stone','diamonds','Darai')),
  CHECK ((token_a <> 'Darai' AND token_b <> 'Darai') OR token_a = 'gold' OR token_b = 'gold')
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_pool_pair_uq
  ON yuplink.bank_pool (least(token_a, token_b), greatest(token_a, token_b));
