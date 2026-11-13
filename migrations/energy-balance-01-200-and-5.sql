-- Баланс энергии (владелец, 25.10.2026): «Базовая энергия 200 (вместо 100).
-- Наполнение энергии 5 мин = 5 энергий (вместо 1)».
--
--  • energy_settle_calc — ниже предела +5 за тик 300 с (тик короче с Интеллектом,
--    как и раньше); таяние выше предела не меняется (−1 за 600 с).
--  • Базовый предел user_energy.max_energy 100 → 200 у всех, у кого он был 100
--    (прибавка Интеллекта героя — сверху, как была); новые счета — 200 и
--    стартовые 200 (energy_touch_acc / energy_add_acc), запасной ответ
--    energy_compute_acc без строки — 200.
-- Тела функций — с прода 25.10.2026, изменены только эти числа. Зеркало на TS —
-- src/lib/energySettle.ts. Идемпотентно.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION yuplink.energy_settle_calc(p_energy numeric, p_max numeric, p_bought numeric, p_regen_pct numeric, p_last timestamp with time zone, p_now timestamp with time zone, p_decay_on boolean DEFAULT true)
 RETURNS TABLE(energy numeric, updated_at timestamp with time zone, regen numeric, decay numeric, next_secs integer, trend text)
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  REGEN_TICK_SEC CONSTANT numeric := 300;
  -- Наполнение (владелец, 25.10.2026): 5 энергии за 5 минут (было 1).
  REGEN_PER_TICK CONSTANT numeric := 5;
  DECAY_TICK_SEC CONSTANT numeric := 600;
  v_state text; v_floor numeric; v_elapsed numeric; v_step numeric; v_ticks numeric; v_new numeric;
BEGIN
  v_state := yuplink.energy_state(p_energy, p_max, p_bought, p_decay_on);
  v_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (p_now - p_last)));
  IF v_state = 'regen' THEN
    v_step := REGEN_TICK_SEC / (1 + COALESCE(p_regen_pct, 0) / 100.0);
    v_ticks := FLOOR(v_elapsed / v_step);
    v_new := LEAST(p_max, p_energy + v_ticks * REGEN_PER_TICK);
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
END $function$;

CREATE OR REPLACE FUNCTION yuplink.energy_touch_acc(p_account text, p_spend numeric DEFAULT 0)
 RETURNS TABLE(energy_now numeric, max_energy numeric, next_regen_seconds integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_row yuplink.user_energy%ROWTYPE; v_max numeric; v_on boolean; s record;
  v_new numeric; v_bought numeric; v_upd timestamptz; v_before text; v_after text; v_next integer;
BEGIN
  IF p_account IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO yuplink.user_energy(account_id, wallet, energy, max_energy, last_updated_at)
    VALUES (p_account, NULL, 200, 200, now()) RETURNING * INTO v_row;
    PERFORM yuplink.energy_log_acc(p_account, 200, 'energy_opening', 'opening:' || p_account);
  END IF;
  v_max := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  v_on := yuplink.energy_decay_on_acc(p_account);
  SELECT * INTO s FROM yuplink.energy_settle_calc(
    v_row.energy, v_max, v_row.bought, v_row.hero_regen_pct, yuplink.energy_decay_from_acc(p_account, v_row.last_updated_at, v_row.energy, v_max), now(), v_on);
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
END $function$;

CREATE OR REPLACE FUNCTION yuplink.energy_add_acc(p_account text, p_amount numeric, p_kind text DEFAULT 'energy_add'::text, p_ref text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
    VALUES (p_account, NULL, 200 + p_amount, 200, now(),
            CASE WHEN v_prot THEN GREATEST(0, p_amount) ELSE 0 END);
    PERFORM yuplink.energy_log_acc(p_account, 200, 'energy_opening', 'opening:' || p_account);
    PERFORM yuplink.energy_log_acc(p_account, p_amount, p_kind, p_ref);
    RETURN;
  END IF;
  v_max := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  v_on := yuplink.energy_decay_on_acc(p_account);
  SELECT * INTO s FROM yuplink.energy_settle_calc(
    v_row.energy, v_max, v_row.bought, v_row.hero_regen_pct, yuplink.energy_decay_from_acc(p_account, v_row.last_updated_at, v_row.energy, v_max), now(), v_on);
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
END $function$;

CREATE OR REPLACE FUNCTION yuplink.energy_compute_acc(p_account text)
 RETURNS TABLE(energy_now numeric, max_energy numeric, next_regen_seconds integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_row yuplink.user_energy%ROWTYPE; v_max numeric; s record;
BEGIN
  IF p_account IS NULL THEN RETURN QUERY SELECT 200::numeric, 200::numeric, 0; RETURN; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account;
  IF NOT FOUND THEN RETURN QUERY SELECT 200::numeric, 200::numeric, 0; RETURN; END IF;
  v_max := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  SELECT * INTO s FROM yuplink.energy_settle_calc(
    v_row.energy, v_max, v_row.bought, v_row.hero_regen_pct,
    yuplink.energy_decay_from_acc(p_account, v_row.last_updated_at, v_row.energy, v_max), now(), yuplink.energy_decay_on_acc(p_account));
  RETURN QUERY SELECT ROUND(s.energy, 2), v_max, s.next_secs;
END $function$;

ALTER TABLE yuplink.user_energy ALTER COLUMN max_energy SET DEFAULT 200;
UPDATE yuplink.user_energy SET max_energy = 200 WHERE max_energy = 100;

COMMIT;
