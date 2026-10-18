-- Храм замка (владелец, 07.10.2026): личный храм с прокачкой. Правила — в
-- src/lib/castleTemple.ts; здесь хранение и три атомарные операции, каждая под
-- замком аккаунта и с ключом операции (повтор того же нажатия ничего не делает).
--   castle_temple_upgrade — списать ресурсы (res_move, не в минус) и поднять уровень;
--   castle_temple_set_points — разложить очки веры (сумма ≤ уровня; забрать уже
--     вложенное — раз в сутки);
--   castle_temple_pray — раз в 6 часов: при продлении списать звёзды (acc_move)
--     и повесить баффы (beta_raid_player_effects, source 'castle_temple').

CREATE TABLE IF NOT EXISTS yuplink.castle_temple (
  account_id text PRIMARY KEY,
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  points jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_prayer_at timestamptz,
  points_reset_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yuplink.castle_temple_op (
  op_id text PRIMARY KEY,
  account_id text NOT NULL,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS castle_temple_op_acc_idx ON yuplink.castle_temple_op (account_id, created_at DESC);

-- ── Улучшение: p_cost посчитан приложением от уровня p_from (upgradeCost).
CREATE OR REPLACE FUNCTION yuplink.castle_temple_upgrade(
  p_account text, p_from integer, p_cost jsonb, p_op text)
RETURNS TABLE(level integer, applied boolean)
LANGUAGE plpgsql AS $$
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
END $$;

-- ── Раскладка очков веры.
CREATE OR REPLACE FUNCTION yuplink.castle_temple_set_points(p_account text, p_points jsonb)
RETURNS TABLE(points jsonb, reset_used boolean)
LANGUAGE plpgsql AS $$
DECLARE v_row yuplink.castle_temple%ROWTYPE; v_sum integer := 0; v_back boolean := false; v_key text; v_val integer;
BEGIN
  IF jsonb_typeof(p_points) <> 'object' THEN RAISE EXCEPTION 'temple_bad_points'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('temple:' || p_account));
  INSERT INTO yuplink.castle_temple(account_id) VALUES (p_account) ON CONFLICT (account_id) DO NOTHING;
  SELECT * INTO v_row FROM yuplink.castle_temple t WHERE t.account_id = p_account FOR UPDATE;
  FOR v_key, v_val IN SELECT key, (value #>> '{}')::integer FROM jsonb_each(p_points) LOOP
    IF v_key NOT IN ('atk','arm','hp','spd','luck','int','trade','alchemy') OR v_val < 0 THEN
      RAISE EXCEPTION 'temple_bad_points';
    END IF;
    v_sum := v_sum + v_val;
  END LOOP;
  IF v_sum > v_row.level THEN RAISE EXCEPTION 'temple_too_many_points:%:%', v_sum, v_row.level; END IF;
  SELECT bool_or(COALESCE((p_points->>k)::integer, 0) < (v_row.points->>k)::integer) INTO v_back
    FROM jsonb_object_keys(v_row.points) AS k;
  v_back := COALESCE(v_back, false);
  IF v_back AND v_row.points_reset_at IS NOT NULL AND v_row.points_reset_at > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'temple_reset_wait:%', ceil(extract(epoch FROM v_row.points_reset_at + interval '24 hours' - now()));
  END IF;
  UPDATE yuplink.castle_temple
     SET points = p_points, updated_at = now(),
         points_reset_at = CASE WHEN v_back THEN now() ELSE points_reset_at END
   WHERE account_id = p_account;
  RETURN QUERY SELECT p_points, v_back;
END $$;

-- ── Молитва: p_effects = [{"kind":"buff_atk","value":12,"seconds":300}, …].
CREATE OR REPLACE FUNCTION yuplink.castle_temple_pray(
  p_account text, p_wallet text, p_effects jsonb, p_stars numeric, p_op text)
RETURNS TABLE(applied boolean, next_at timestamptz)
LANGUAGE plpgsql AS $$
DECLARE v_row yuplink.castle_temple%ROWTYPE; v_e jsonb; v_ok boolean; v_bal numeric;
BEGIN
  IF p_op IS NULL OR p_op = '' OR jsonb_typeof(p_effects) <> 'array' OR jsonb_array_length(p_effects) = 0 THEN
    RAISE EXCEPTION 'temple_bad_args';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('temple:' || p_account));
  INSERT INTO yuplink.castle_temple(account_id) VALUES (p_account) ON CONFLICT (account_id) DO NOTHING;
  SELECT * INTO v_row FROM yuplink.castle_temple t WHERE t.account_id = p_account FOR UPDATE;
  IF EXISTS (SELECT 1 FROM yuplink.castle_temple_op o WHERE o.op_id = p_op) THEN
    RETURN QUERY SELECT false, v_row.last_prayer_at + interval '6 hours'; RETURN;
  END IF;
  IF v_row.last_prayer_at IS NOT NULL AND v_row.last_prayer_at > now() - interval '6 hours' THEN
    RAISE EXCEPTION 'temple_cooldown:%', ceil(extract(epoch FROM v_row.last_prayer_at + interval '6 hours' - now()));
  END IF;
  IF COALESCE(p_stars, 0) > 0 THEN
    SELECT m.balance, m.applied INTO v_bal, v_ok
      FROM yuplink.acc_move(p_account, 'STARS', -p_stars, 'acc_spend', 'temple:' || p_op, p_wallet) AS m;
    IF NOT v_ok THEN RAISE EXCEPTION 'acc_ref_reused:temple:%', p_op; END IF;
  END IF;
  FOR v_e IN SELECT * FROM jsonb_array_elements(p_effects) LOOP
    IF (v_e->>'kind') NOT LIKE 'buff\_%' OR (v_e->>'value')::integer <= 0 OR (v_e->>'seconds')::integer <= 0 THEN
      RAISE EXCEPTION 'temple_bad_effect';
    END IF;
    INSERT INTO yuplink.beta_raid_player_effects(id, wallet, kind, value, expires_at, account_id, source)
    VALUES ('ct_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16), p_wallet, v_e->>'kind',
            (v_e->>'value')::integer, now() + make_interval(secs => (v_e->>'seconds')::integer), p_account, 'castle_temple');
  END LOOP;
  UPDATE yuplink.castle_temple SET last_prayer_at = now(), updated_at = now() WHERE account_id = p_account;
  INSERT INTO yuplink.castle_temple_op(op_id, account_id, kind, detail)
    VALUES (p_op, p_account, 'pray', jsonb_build_object('effects', p_effects, 'stars', COALESCE(p_stars, 0)));
  RETURN QUERY SELECT true, now() + interval '6 hours';
END $$;
