-- Возврат энергии к рабочему виду (acc-45 + acc-49) после поломки 24.09 и
-- поверх — ТОЛЬКО заказанный ребаланс владельца:
--   • базовая энергия 100 (было 30) — новые строки открываются со 100;
--   • наполнение +1 за 5 мин (было 10).
-- Таяние подаренного сверх лимита — как было (−1 за 10 мин), трата не
-- блокируется купленным, купленное тратится последним — всё как в acc-45/49.

BEGIN;
SET lock_timeout = '5s';

-- 1. Расчёт: наполнение 5 мин, таяние 10 мин (без изменений).
CREATE OR REPLACE FUNCTION yuplink.energy_settle_calc(
  p_energy numeric, p_max numeric, p_bought numeric, p_regen_pct numeric,
  p_last timestamptz, p_now timestamptz, p_decay_on boolean DEFAULT true)
RETURNS TABLE(energy numeric, updated_at timestamptz, regen numeric, decay numeric,
              next_secs integer, trend text)
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  REGEN_TICK_SEC CONSTANT numeric := 300;
  DECAY_TICK_SEC CONSTANT numeric := 600;
  v_state text; v_floor numeric; v_elapsed numeric; v_step numeric; v_ticks numeric; v_new numeric;
BEGIN
  v_state := yuplink.energy_state(p_energy, p_max, p_bought, p_decay_on);
  v_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (p_now - p_last)));
  IF v_state = 'regen' THEN
    v_step := REGEN_TICK_SEC / (1 + COALESCE(p_regen_pct, 0) / 100.0);
    v_ticks := FLOOR(v_elapsed / v_step);
    v_new := LEAST(p_max, p_energy + v_ticks);
    IF v_new >= p_max THEN
      RETURN QUERY SELECT v_new, p_now, v_new - p_energy, 0::numeric, 0, 'flat'::text;
    ELSE
      RETURN QUERY SELECT v_new,
        p_last + make_interval(secs => (v_ticks * v_step)::double precision),
        v_new - p_energy, 0::numeric, CEIL(v_step - MOD(v_elapsed, v_step))::integer, 'regen'::text;
    END IF;
  ELSIF v_state = 'decay' THEN
    v_floor := p_max + COALESCE(p_bought, 0);
    v_ticks := FLOOR(v_elapsed / DECAY_TICK_SEC);
    v_new := GREATEST(v_floor, p_energy - v_ticks);
    IF v_new <= v_floor THEN
      RETURN QUERY SELECT v_new, p_now, 0::numeric, p_energy - v_new, 0, 'flat'::text;
    ELSE
      RETURN QUERY SELECT v_new,
        p_last + make_interval(secs => (v_ticks * DECAY_TICK_SEC)::double precision),
        0::numeric, p_energy - v_new, CEIL(DECAY_TICK_SEC - MOD(v_elapsed, DECAY_TICK_SEC))::integer, 'decay'::text;
    END IF;
  ELSE
    RETURN QUERY SELECT p_energy, p_now, 0::numeric, 0::numeric, 0, 'flat'::text;
  END IF;
END $fn$;

-- 2. Чтение (acc-45), база 100.
CREATE OR REPLACE FUNCTION yuplink.energy_compute_acc(p_account text)
RETURNS TABLE(energy_now numeric, max_energy numeric, next_regen_seconds integer)
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_row yuplink.user_energy%ROWTYPE; v_max numeric; s record;
BEGIN
  IF p_account IS NULL THEN RETURN QUERY SELECT 100::numeric, 100::numeric, 0; RETURN; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account;
  IF NOT FOUND THEN RETURN QUERY SELECT 100::numeric, 100::numeric, 0; RETURN; END IF;
  v_max := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  SELECT * INTO s FROM yuplink.energy_settle_calc(
    v_row.energy, v_max, v_row.bought, v_row.hero_regen_pct,
    v_row.last_updated_at, now(), yuplink.energy_decay_on());
  RETURN QUERY SELECT ROUND(s.energy, 2), v_max, s.next_secs;
END $fn$;

-- 3. Закрепить и списать (acc-45), база 100. Трата ничем не блокируется,
--    кроме нехватки энергии; купленное тратится последним.
CREATE OR REPLACE FUNCTION yuplink.energy_touch_acc(p_account text, p_spend numeric DEFAULT 0)
RETURNS TABLE(energy_now numeric, max_energy numeric, next_regen_seconds integer)
LANGUAGE plpgsql AS $fn$
DECLARE
  v_row yuplink.user_energy%ROWTYPE; v_max numeric; v_on boolean; s record;
  v_new numeric; v_bought numeric; v_upd timestamptz; v_before text; v_after text; v_next integer;
BEGIN
  IF p_account IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO yuplink.user_energy(account_id, wallet, energy, max_energy, last_updated_at)
    VALUES (p_account, NULL, 100, 100, now()) RETURNING * INTO v_row;
    PERFORM yuplink.energy_log_acc(p_account, 100, 'energy_opening', 'opening:' || p_account);
  END IF;
  v_max := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  v_on := yuplink.energy_decay_on();
  SELECT * INTO s FROM yuplink.energy_settle_calc(
    v_row.energy, v_max, v_row.bought, v_row.hero_regen_pct, v_row.last_updated_at, now(), v_on);
  IF s.regen > 0 THEN PERFORM yuplink.energy_log_acc(p_account, s.regen, 'energy_regen', NULL); END IF;
  IF s.decay > 0 THEN PERFORM yuplink.energy_log_acc(p_account, -s.decay, 'energy_decay', NULL); END IF;
  v_new := s.energy; v_upd := s.updated_at; v_bought := COALESCE(v_row.bought, 0);
  IF p_spend > 0 THEN
    IF v_new < p_spend THEN RAISE EXCEPTION 'not_enough_energy:%:%', v_new, p_spend; END IF;
    v_before := yuplink.energy_state(v_new, v_max, v_bought, v_on);
    v_new := ROUND(v_new - p_spend, 2);
    v_bought := LEAST(v_bought, v_new);
    v_after := yuplink.energy_state(v_new, v_max, v_bought, v_on);
    IF v_after = 'flat' OR v_after <> v_before THEN v_upd := now(); END IF;
    PERFORM yuplink.energy_log_acc(p_account, -p_spend, 'energy_spend', NULL);
  END IF;
  UPDATE yuplink.user_energy
     SET energy = ROUND(v_new, 2), bought = v_bought, last_updated_at = v_upd
   WHERE account_id = p_account;
  SELECT c.next_secs INTO v_next FROM yuplink.energy_settle_calc(
    v_new, v_max, v_bought, v_row.hero_regen_pct, v_upd, now(), v_on) c;
  RETURN QUERY SELECT ROUND(v_new, 2), v_max, v_next;
END $fn$;

-- 4. Начислить (acc-49: тает только выданное админом), база 100.
CREATE OR REPLACE FUNCTION yuplink.energy_add_acc(
  p_account text, p_amount numeric, p_kind text DEFAULT 'energy_add', p_ref text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  GIFT_KINDS CONSTANT text[] := ARRAY['energy_admin', 'admin_grant', 'energy_grant', 'energy_gift',
                                      'energy_compensation', 'energy_tester'];
  NATURAL_KINDS CONSTANT text[] := ARRAY['energy_regen', 'energy_opening'];
  REFUND_KINDS CONSTANT text[] := ARRAY['energy_refund', 'mine_refund'];
  v_row yuplink.user_energy%ROWTYPE; v_max numeric; v_on boolean; s record;
  v_settled numeric; v_new numeric; v_bought numeric; v_upd timestamptz; v_before text; v_after text;
  v_prot boolean;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 OR p_account IS NULL THEN RETURN; END IF;
  v_prot := p_amount > 0 AND NOT (p_kind = ANY(GIFT_KINDS)) AND NOT (p_kind = ANY(NATURAL_KINDS))
            AND NOT (p_kind = ANY(REFUND_KINDS));
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO yuplink.user_energy(account_id, wallet, energy, max_energy, last_updated_at, bought)
    VALUES (p_account, NULL, 100 + p_amount, 100, now(),
            CASE WHEN v_prot THEN GREATEST(0, p_amount) ELSE 0 END);
    PERFORM yuplink.energy_log_acc(p_account, 100, 'energy_opening', 'opening:' || p_account);
    PERFORM yuplink.energy_log_acc(p_account, p_amount, p_kind, p_ref);
    RETURN;
  END IF;
  v_max := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  v_on := yuplink.energy_decay_on();
  SELECT * INTO s FROM yuplink.energy_settle_calc(
    v_row.energy, v_max, v_row.bought, v_row.hero_regen_pct, v_row.last_updated_at, now(), v_on);
  IF s.regen > 0 THEN PERFORM yuplink.energy_log_acc(p_account, s.regen, 'energy_regen', NULL); END IF;
  IF s.decay > 0 THEN PERFORM yuplink.energy_log_acc(p_account, -s.decay, 'energy_decay', NULL); END IF;
  v_settled := s.energy; v_bought := COALESCE(v_row.bought, 0);
  v_before := yuplink.energy_state(v_settled, v_max, v_bought, v_on);
  v_new := ROUND(v_settled + p_amount, 2);
  IF v_prot THEN
    v_bought := v_bought + p_amount;
  ELSIF p_kind = ANY(REFUND_KINDS) AND p_amount > 0 AND v_bought >= v_settled THEN
    v_bought := v_bought + p_amount;
  END IF;
  v_bought := GREATEST(0, LEAST(v_bought, v_new));
  v_after := yuplink.energy_state(v_new, v_max, v_bought, v_on);
  v_upd := CASE WHEN v_after <> 'flat' AND v_after = v_before THEN s.updated_at ELSE now() END;
  UPDATE yuplink.user_energy
     SET energy = v_new, bought = v_bought, last_updated_at = v_upd
   WHERE account_id = p_account;
  PERFORM yuplink.energy_log_acc(p_account, p_amount, p_kind, p_ref);
END $fn$;

COMMIT;
