-- Склад замка (владелец, 08.10.2026): личный склад, ячейки с 1 до 20.
-- Товары лежат в общей таблице полок (raid_warehouse_slot) на месте
-- map_id = 'castle', q = r = 0, scope 'own' — та же запись, то же «положить /
-- забрать» (warehouse-put.ts, warehouse-take.ts). Здесь — число ячеек и покупка
-- следующей: ресурсы списываются res_move (не в минус), ключ операции, потолок 20.

CREATE TABLE IF NOT EXISTS yuplink.castle_warehouse (
  account_id text PRIMARY KEY,
  cells integer NOT NULL DEFAULT 1 CHECK (cells BETWEEN 1 AND 20),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.castle_warehouse_op (
  op_id text PRIMARY KEY,
  account_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- p_cost посчитан приложением по числу ячеек p_from (lib/castleWarehouse.ts).
CREATE OR REPLACE FUNCTION yuplink.castle_warehouse_upgrade(
  p_account text, p_from integer, p_cost jsonb, p_op text)
RETURNS TABLE(cells integer, applied boolean)
LANGUAGE plpgsql AS $$
DECLARE v_cells integer; v_res text; v_amt numeric;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'cwh_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cwh:' || p_account));
  INSERT INTO yuplink.castle_warehouse(account_id) VALUES (p_account) ON CONFLICT (account_id) DO NOTHING;
  SELECT w.cells INTO v_cells FROM yuplink.castle_warehouse w WHERE w.account_id = p_account FOR UPDATE;
  IF EXISTS (SELECT 1 FROM yuplink.castle_warehouse_op o WHERE o.op_id = p_op) THEN
    RETURN QUERY SELECT v_cells, false; RETURN;
  END IF;
  IF v_cells <> p_from THEN RAISE EXCEPTION 'cwh_cells_moved:%', v_cells; END IF;
  IF v_cells >= 20 THEN RAISE EXCEPTION 'cwh_max_cells'; END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'cwh_bad_cost'; END IF;
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'castle_wh_cell', 'cwh:' || p_op || ':' || v_res);
    END IF;
  END LOOP;
  UPDATE yuplink.castle_warehouse SET cells = v_cells + 1, updated_at = now() WHERE account_id = p_account;
  INSERT INTO yuplink.castle_warehouse_op(op_id, account_id, detail)
    VALUES (p_op, p_account, jsonb_build_object('from', v_cells, 'cost', p_cost));
  RETURN QUERY SELECT v_cells + 1, true;
END $$;
