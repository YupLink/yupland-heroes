-- Волна 1: функции энергии считают по аккаунту, а не по кошельку.
-- Старые имена остаются тонкими обёртками, чтобы прод не встал в момент
-- выкатки: они лишь переводят адрес в аккаунт и зовут новые.
BEGIN;

CREATE OR REPLACE FUNCTION yuplink.energy_log_acc(
  p_account text, p_delta numeric, p_kind text DEFAULT 'energy', p_ref text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF p_delta IS NULL OR p_delta = 0 OR p_account IS NULL THEN RETURN; END IF;
  INSERT INTO yuplink.currency_ledger(id, account_id, wallet, token, delta, kind, ref, created_at)
  VALUES ('cl_' || substr(md5(random()::text || clock_timestamp()::text), 1, 14),
          p_account, NULL, 'Energy', p_delta, COALESCE(p_kind, 'energy'), p_ref, now());
EXCEPTION WHEN OTHERS THEN
  -- Запись в леджер никогда не должна ронять бой или покупку.
  NULL;
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.energy_compute_acc(p_account text)
RETURNS TABLE(energy_now numeric, max_energy numeric, next_regen_seconds integer)
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  REGEN_SEC CONSTANT INT := 600;
  v_row yuplink.user_energy%ROWTYPE;
  v_elapsed INT; v_regen INT; v_new_energy NUMERIC; v_secs_to_next INT;
  v_max NUMERIC; v_step NUMERIC;
BEGIN
  IF p_account IS NULL THEN RETURN QUERY SELECT 30::numeric, 30::numeric, 0; RETURN; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account;
  IF NOT FOUND THEN RETURN QUERY SELECT 30::numeric, 30::numeric, 0; RETURN; END IF;
  v_max  := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  v_step := REGEN_SEC / (1 + COALESCE(v_row.hero_regen_pct, 0) / 100.0);
  v_elapsed := EXTRACT(EPOCH FROM (now() - v_row.last_updated_at))::INT;
  v_regen := FLOOR(v_elapsed / v_step);
  v_new_energy := GREATEST(v_row.energy, LEAST(v_max, v_row.energy + v_regen));
  IF v_new_energy >= v_max THEN v_secs_to_next := 0;
  ELSE v_secs_to_next := CEIL(v_step - MOD(v_elapsed::numeric, v_step)); END IF;
  RETURN QUERY SELECT ROUND(v_new_energy, 2), v_max, v_secs_to_next;
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.energy_add_acc(
  p_account text, p_amount numeric, p_kind text DEFAULT 'energy_add', p_ref text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  REGEN_SEC CONSTANT INT := 600;
  v_row yuplink.user_energy%ROWTYPE;
  v_elapsed INT; v_regen INT; v_settled NUMERIC; v_max NUMERIC; v_step NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 OR p_account IS NULL THEN RETURN; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO yuplink.user_energy(account_id, wallet, energy, max_energy, last_updated_at)
    VALUES (p_account, NULL, 30 + p_amount, 30, now());
    PERFORM yuplink.energy_log_acc(p_account, 30, 'energy_opening', 'opening:' || p_account);
    PERFORM yuplink.energy_log_acc(p_account, p_amount, p_kind, p_ref);
    RETURN;
  END IF;
  v_max  := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  v_step := REGEN_SEC / (1 + COALESCE(v_row.hero_regen_pct, 0) / 100.0);
  v_elapsed := EXTRACT(EPOCH FROM (now() - v_row.last_updated_at))::INT;
  v_regen := FLOOR(v_elapsed / v_step);
  v_settled := GREATEST(v_row.energy, LEAST(v_max, v_row.energy + v_regen));
  IF v_settled > v_row.energy THEN
    PERFORM yuplink.energy_log_acc(p_account, v_settled - v_row.energy, 'energy_regen', NULL);
  END IF;
  UPDATE yuplink.user_energy SET energy = ROUND(v_settled + p_amount, 2), last_updated_at = now()
   WHERE account_id = p_account;
  PERFORM yuplink.energy_log_acc(p_account, p_amount, p_kind, p_ref);
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.energy_touch_acc(p_account text, p_spend numeric DEFAULT 0)
RETURNS TABLE(energy_now numeric, max_energy numeric, next_regen_seconds integer)
LANGUAGE plpgsql AS $fn$
DECLARE
  REGEN_SEC CONSTANT INT := 600;
  v_row yuplink.user_energy%ROWTYPE;
  v_elapsed INT; v_regen INT; v_new_energy NUMERIC;
  v_new_updated_at TIMESTAMPTZ; v_secs_to_next INT; v_max NUMERIC; v_step NUMERIC;
BEGIN
  IF p_account IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO yuplink.user_energy(account_id, wallet, energy, max_energy, last_updated_at)
    VALUES (p_account, NULL, 30, 30, now()) RETURNING * INTO v_row;
    PERFORM yuplink.energy_log_acc(p_account, 30, 'energy_opening', 'opening:' || p_account);
  END IF;
  v_max  := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  v_step := REGEN_SEC / (1 + COALESCE(v_row.hero_regen_pct, 0) / 100.0);
  v_elapsed := EXTRACT(EPOCH FROM (now() - v_row.last_updated_at))::INT;
  v_regen := FLOOR(v_elapsed / v_step);
  v_new_energy := GREATEST(v_row.energy, LEAST(v_max, v_row.energy + v_regen));
  IF v_regen > 0 THEN
    -- Остаток времени НЕ теряем: сдвигаем метку ровно на выданные тики.
    v_new_updated_at := v_row.last_updated_at + make_interval(secs => (v_regen * v_step)::double precision);
  ELSE v_new_updated_at := v_row.last_updated_at; END IF;
  IF v_new_energy > v_row.energy THEN
    PERFORM yuplink.energy_log_acc(p_account, v_new_energy - v_row.energy, 'energy_regen', NULL);
  END IF;
  IF p_spend > 0 THEN
    IF v_new_energy < p_spend THEN RAISE EXCEPTION 'not_enough_energy:%:%', v_new_energy, p_spend; END IF;
    IF v_new_energy >= v_max THEN v_new_updated_at := now(); END IF;
    v_new_energy := ROUND(v_new_energy - p_spend, 2);
    PERFORM yuplink.energy_log_acc(p_account, -p_spend, 'energy_spend', NULL);
  END IF;
  UPDATE yuplink.user_energy SET energy = v_new_energy, last_updated_at = v_new_updated_at
   WHERE account_id = p_account;
  IF v_new_energy >= v_max THEN v_secs_to_next := 0;
  ELSE
    v_secs_to_next := CEIL(v_step - EXTRACT(EPOCH FROM (now() - v_new_updated_at)));
    IF v_secs_to_next < 0 THEN v_secs_to_next := CEIL(v_step); END IF;
  END IF;
  RETURN QUERY SELECT v_new_energy, v_max, v_secs_to_next;
END $fn$;

-- Обёртки под старыми именами: живут ровно до тех пор, пока последний вызов в
-- коде не переедет на acc-функции.
CREATE OR REPLACE FUNCTION yuplink.add_energy(
  p_wallet text, p_amount numeric, p_kind text DEFAULT 'energy_add', p_ref text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN PERFORM yuplink.energy_add_acc(yuplink.acc_of(p_wallet), p_amount, p_kind, p_ref); END $fn$;

CREATE OR REPLACE FUNCTION yuplink.log_energy(
  p_wallet text, p_delta numeric, p_kind text DEFAULT 'energy', p_ref text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN PERFORM yuplink.energy_log_acc(yuplink.acc_of(p_wallet), p_delta, p_kind, p_ref); END $fn$;

CREATE OR REPLACE FUNCTION yuplink.compute_energy(p_wallet text)
RETURNS TABLE(energy_now numeric, max_energy numeric, next_regen_seconds integer)
LANGUAGE plpgsql STABLE AS $fn$
BEGIN RETURN QUERY SELECT * FROM yuplink.energy_compute_acc(yuplink.acc_of(p_wallet)); END $fn$;

CREATE OR REPLACE FUNCTION yuplink.touch_energy_atomic(p_wallet text, p_spend numeric DEFAULT 0)
RETURNS TABLE(energy_now numeric, max_energy numeric, next_regen_seconds integer)
LANGUAGE plpgsql AS $fn$
BEGIN RETURN QUERY SELECT * FROM yuplink.energy_touch_acc(yuplink.acc_of(p_wallet), p_spend); END $fn$;

COMMIT;
