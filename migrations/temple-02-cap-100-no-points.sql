-- Храм замка, правка владельца 07.10.2026: потолок прокачки — 100-й уровень;
-- очки веры вручную не раскладываются (выбранный бонус получает силу «уровень ×
-- базовое значение», считает приложение) — раскладка и её столбцы убраны.

ALTER TABLE yuplink.castle_temple DROP CONSTRAINT IF EXISTS castle_temple_level_max;
ALTER TABLE yuplink.castle_temple ADD CONSTRAINT castle_temple_level_max CHECK (level <= 100);
DROP FUNCTION IF EXISTS yuplink.castle_temple_set_points(text, jsonb);
ALTER TABLE yuplink.castle_temple DROP COLUMN IF EXISTS points, DROP COLUMN IF EXISTS points_reset_at;

CREATE OR REPLACE FUNCTION yuplink.castle_temple_upgrade(p_account text, p_from integer, p_cost jsonb, p_op text)
 RETURNS TABLE(level integer, applied boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE v_level integer; v_res text; v_amt numeric;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'temple_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('temple:' || p_account));
  INSERT INTO yuplink.castle_temple(account_id) VALUES (p_account) ON CONFLICT (account_id) DO NOTHING;
  SELECT t.level INTO v_level FROM yuplink.castle_temple t WHERE t.account_id = p_account FOR UPDATE;
  IF EXISTS (SELECT 1 FROM yuplink.castle_temple_op o WHERE o.op_id = p_op) THEN
    RETURN QUERY SELECT v_level, false; RETURN;
  END IF;
  IF v_level <> p_from THEN RAISE EXCEPTION 'temple_level_moved:%', v_level; END IF;
  IF v_level >= 100 THEN RAISE EXCEPTION 'temple_max_level:%', v_level; END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'temple_bad_cost'; END IF;
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'temple_upgrade', 'temple:' || p_op || ':' || v_res);
    END IF;
  END LOOP;
  UPDATE yuplink.castle_temple SET level = v_level + 1, updated_at = now() WHERE account_id = p_account;
  INSERT INTO yuplink.castle_temple_op(op_id, account_id, kind, detail)
    VALUES (p_op, p_account, 'upgrade', jsonb_build_object('from', v_level, 'cost', p_cost));
  RETURN QUERY SELECT v_level + 1, true;
END $function$;
