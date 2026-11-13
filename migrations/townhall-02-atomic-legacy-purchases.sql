-- Yupland Heroes: serialize ALL building purchases with the catalogue.
-- Apply before the matching server code. Never run from the UI.
-- Prerequisites: townhall-01, casino-02, minev2-40 (five-argument architect), auction house.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $guard$
BEGIN
  IF to_regprocedure('yuplink.castle_architect_upgrade(text,integer,jsonb,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply minev2-40-architect-goods before townhall-02';
  END IF;
END $guard$;
-- Shared purchase limit. Keep constants aligned with src/lib/townHall.ts.
CREATE OR REPLACE FUNCTION yuplink.castle_assert_purchase_slot(p_account text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_level integer; v_used integer; v_limit integer;
BEGIN
  IF p_account IS NULL OR p_account = '' THEN RAISE EXCEPTION 'townhall_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('townhall:' || p_account));
  SELECT t.level INTO v_level FROM yuplink.castle_townhall t WHERE t.account_id = p_account;
  v_level := LEAST(9, GREATEST(1, COALESCE(v_level, 1)));
  v_limit := 8 + 7 * (v_level - 1);
  v_used := yuplink.castle_slots_used(p_account);
  IF v_used >= v_limit THEN RAISE EXCEPTION 'townhall_no_slot:%:%', v_used, v_limit; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.castle_casino_build(p_account text, p_cost jsonb, p_op text)
RETURNS TABLE(built boolean, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_res text; v_amt numeric;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN
    RAISE EXCEPTION 'casino_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('townhall:' || p_account));
  PERFORM pg_advisory_xact_lock(hashtext('castlecasino:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.castle_casino c WHERE c.account_id = p_account) THEN
    RETURN QUERY SELECT true, false; RETURN;
  END IF;
  PERFORM yuplink.castle_assert_purchase_slot(p_account);
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

CREATE OR REPLACE FUNCTION yuplink.castle_architect_upgrade(
  p_account text, p_from integer, p_cost jsonb, p_op text, p_hero text DEFAULT NULL
) RETURNS TABLE(level integer, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_level integer; v_res text; v_amt numeric; v_goods jsonb;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'architect_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('townhall:' || p_account));
  PERFORM pg_advisory_xact_lock(hashtext('architect:' || p_account));
  INSERT INTO yuplink.castle_architect(account_id) VALUES (p_account) ON CONFLICT (account_id) DO NOTHING;
  SELECT a.level INTO v_level FROM yuplink.castle_architect a WHERE a.account_id = p_account FOR UPDATE;
  IF EXISTS (SELECT 1 FROM yuplink.castle_architect_op o WHERE o.op_id = p_op) THEN
    RETURN QUERY SELECT v_level, false; RETURN;
  END IF;
  IF v_level <> p_from THEN RAISE EXCEPTION 'architect_level_moved:%', v_level; END IF;
  IF v_level >= 4 THEN RAISE EXCEPTION 'architect_max_level'; END IF;
  IF v_level = 0 THEN PERFORM yuplink.castle_assert_purchase_slot(p_account); END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'architect_bad_cost'; END IF;
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'architect', 'archup:' || p_op || ':' || v_res);
    END IF;
  END LOOP;
  v_goods := yuplink.castle_architect_take_goods(p_hero, p_cost->'goods');
  UPDATE yuplink.castle_architect SET level = v_level + 1, updated_at = now() WHERE account_id = p_account;
  INSERT INTO yuplink.castle_architect_op(op_id, account_id, kind, detail)
    VALUES (p_op, p_account, 'upgrade',
            jsonb_build_object('from', v_level, 'cost', p_cost)
            || CASE WHEN jsonb_array_length(v_goods) > 0
                    THEN jsonb_build_object('hero', p_hero, 'goods', v_goods) ELSE '{}'::jsonb END);
  RETURN QUERY SELECT v_level + 1, true;
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.castle_auction_house_upgrade(
  p_account text, p_from integer, p_cost jsonb, p_op text
) RETURNS TABLE(level integer, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_level integer; v_res text; v_amt numeric;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'house_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('townhall:' || p_account));
  PERFORM pg_advisory_xact_lock(hashtext('auchouse:' || p_account));
  INSERT INTO yuplink.castle_auction_house(account_id) VALUES (p_account) ON CONFLICT (account_id) DO NOTHING;
  SELECT h.level INTO v_level FROM yuplink.castle_auction_house h WHERE h.account_id = p_account FOR UPDATE;
  IF EXISTS (SELECT 1 FROM yuplink.castle_auction_house_op o WHERE o.op_id = p_op) THEN
    RETURN QUERY SELECT v_level, false; RETURN;
  END IF;
  IF v_level <> p_from THEN RAISE EXCEPTION 'house_level_moved:%', v_level; END IF;
  IF v_level >= 10 THEN RAISE EXCEPTION 'house_max_level'; END IF;
  IF v_level = 0 THEN PERFORM yuplink.castle_assert_purchase_slot(p_account); END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'house_bad_cost'; END IF;
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'auction_house', 'auchouse:' || p_op || ':' || v_res);
    END IF;
  END LOOP;
  UPDATE yuplink.castle_auction_house SET level = v_level + 1, updated_at = now() WHERE account_id = p_account;
  INSERT INTO yuplink.castle_auction_house_op(op_id, account_id, detail)
    VALUES (p_op, p_account, jsonb_build_object('from', v_level, 'cost', p_cost));
  RETURN QUERY SELECT v_level + 1, true;
END $fn$;
COMMIT;
