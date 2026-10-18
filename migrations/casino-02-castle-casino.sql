-- Казино в замке (владелец, 14.10.2026): постройка за ресурсы, без уровней.
-- Правила и цена — src/lib/castleCasino.ts, ручки — src/server/api/slot/castle-casino.ts.
-- Идемпотентно.
CREATE TABLE IF NOT EXISTS yuplink.castle_casino (
  account_id text PRIMARY KEY,
  built_at timestamptz NOT NULL DEFAULT now(),
  op_id text NOT NULL,
  cost jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Постройка: под замком аккаунта; уже построено — ничего не списываем
-- (повтор нажатия безвреден); ресурсы — res_move (не в минус) с ключами по p_op.
CREATE OR REPLACE FUNCTION yuplink.castle_casino_build(p_account text, p_cost jsonb, p_op text)
RETURNS TABLE(built boolean, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_res text; v_amt numeric;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN
    RAISE EXCEPTION 'casino_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('castlecasino:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.castle_casino c WHERE c.account_id = p_account) THEN
    RETURN QUERY SELECT true, false; RETURN;
  END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'casino_bad_cost'; END IF;
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'castle_casino', 'castlecasino:' || p_op || ':' || v_res);
    END IF;
  END LOOP;
  INSERT INTO yuplink.castle_casino(account_id, op_id, cost) VALUES (p_account, p_op, p_cost);
  RETURN QUERY SELECT true, true;
END $fn$;
