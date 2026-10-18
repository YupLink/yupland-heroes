-- «Эксперт»: энергия не тает, пока подписка действует (владелец, 03.10.2026).
--
-- Флаг no_decay у тарифа (у «Эксперта» включён) и снимком у подписки. Пока у
-- аккаунта есть действующая подписка с флагом, таяние (−1 за 10 минут сверх
-- лимита и купленного) для него выключено: energy_decay_on_acc вместо общего
-- energy_decay_on. Края подписки честные:
--  · конец — таяние считается с момента конца подписки, а не с последнего
--    касания энергии во время неё (energy_decay_from_acc); реген не трогаем:
--    он идёт ниже лимита, где таяния нет;
--  · начало — перед выдачей подписки энергия досчитывается (покупка/выдача
--    зовут energy_touch_acc), здесь — для уже действующих «Экспертов».
-- Четыре функции энергии — тексты с прода, изменены только эти два места.
BEGIN;
SET lock_timeout = '5s';

ALTER TABLE yuplink.energy_sub_tier ADD COLUMN IF NOT EXISTS no_decay boolean NOT NULL DEFAULT false;
ALTER TABLE yuplink.energy_sub      ADD COLUMN IF NOT EXISTS no_decay boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION yuplink.energy_decay_on_acc(p_account text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT yuplink.energy_decay_on()
     AND NOT EXISTS (SELECT 1 FROM yuplink.energy_sub s
                      WHERE s.account_id = p_account AND s.no_decay
                        AND s.starts_at <= now() AND s.ends_at > now())
$function$;

CREATE OR REPLACE FUNCTION yuplink.energy_decay_from_acc(p_account text, p_last timestamptz, p_energy numeric, p_max numeric)
 RETURNS timestamptz
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE WHEN p_energy < p_max THEN p_last
              ELSE GREATEST(p_last, COALESCE((SELECT max(s.ends_at) FROM yuplink.energy_sub s
                                               WHERE s.account_id = p_account AND s.no_decay
                                                 AND s.ends_at <= now() AND s.ends_at > p_last), p_last))
         END
$function$;

-- Действующие «Эксперты»: сначала досчитать энергию по старым правилам, потом флаг.
SELECT yuplink.energy_touch_acc(x.account_id, 0)
  FROM (SELECT DISTINCT account_id FROM yuplink.energy_sub
         WHERE tier_id = 'esub_expert' AND ends_at > now()) x;
UPDATE yuplink.energy_sub_tier SET no_decay = true WHERE id = 'esub_expert';
UPDATE yuplink.energy_sub SET no_decay = true WHERE tier_id = 'esub_expert';

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
    VALUES (p_account, NULL, 100 + p_amount, 100, now(),
            CASE WHEN v_prot THEN GREATEST(0, p_amount) ELSE 0 END);
    PERFORM yuplink.energy_log_acc(p_account, 100, 'energy_opening', 'opening:' || p_account);
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
  IF p_account IS NULL THEN RETURN QUERY SELECT 100::numeric, 100::numeric, 0; RETURN; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account;
  IF NOT FOUND THEN RETURN QUERY SELECT 100::numeric, 100::numeric, 0; RETURN; END IF;
  v_max := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  SELECT * INTO s FROM yuplink.energy_settle_calc(
    v_row.energy, v_max, v_row.bought, v_row.hero_regen_pct,
    yuplink.energy_decay_from_acc(p_account, v_row.last_updated_at, v_row.energy, v_max), now(), yuplink.energy_decay_on_acc(p_account));
  RETURN QUERY SELECT ROUND(s.energy, 2), v_max, s.next_secs;
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
    VALUES (p_account, NULL, 100, 100, now()) RETURNING * INTO v_row;
    PERFORM yuplink.energy_log_acc(p_account, 100, 'energy_opening', 'opening:' || p_account);
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

CREATE OR REPLACE FUNCTION yuplink.energy_set_hero_bonus(p_account text, p_max_bonus integer, p_regen_pct numeric)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_row yuplink.user_energy%ROWTYPE; v_max_old numeric; v_max_new numeric; v_on boolean; s record;
  v_before text; v_after text; v_upd timestamptz;
BEGIN
  IF p_account IS NULL THEN RETURN; END IF;
  SELECT * INTO v_row FROM yuplink.user_energy WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(v_row.hero_max_bonus, 0) = COALESCE(p_max_bonus, 0)
     AND COALESCE(v_row.hero_regen_pct, 0) = COALESCE(p_regen_pct, 0) THEN
    RETURN;
  END IF;
  v_max_old := v_row.max_energy + COALESCE(v_row.hero_max_bonus, 0);
  v_max_new := v_row.max_energy + COALESCE(p_max_bonus, 0);
  v_on := yuplink.energy_decay_on_acc(p_account);
  SELECT * INTO s FROM yuplink.energy_settle_calc(
    v_row.energy, v_max_old, v_row.bought, v_row.hero_regen_pct, yuplink.energy_decay_from_acc(p_account, v_row.last_updated_at, v_row.energy, v_max_old), now(), v_on);
  IF s.regen > 0 THEN PERFORM yuplink.energy_log_acc(p_account, s.regen, 'energy_regen', NULL); END IF;
  IF s.decay > 0 THEN PERFORM yuplink.energy_log_acc(p_account, -s.decay, 'energy_decay', NULL); END IF;
  v_before := yuplink.energy_state(s.energy, v_max_old, v_row.bought, v_on);
  v_after := yuplink.energy_state(s.energy, v_max_new, v_row.bought, v_on);
  -- Лимит ушёл вниз (снят умный герой) — таяние начинается с этого момента,
  -- а не с многодневного elapsed; лимит вырос — реген с этого момента.
  v_upd := CASE WHEN v_after <> 'flat' AND v_after = v_before THEN s.updated_at ELSE now() END;
  UPDATE yuplink.user_energy
     SET energy = ROUND(s.energy, 2),
         last_updated_at = v_upd,
         hero_max_bonus = COALESCE(p_max_bonus, 0),
         hero_regen_pct = COALESCE(p_regen_pct, 0)
   WHERE account_id = p_account;
END $function$;

ALTER FUNCTION yuplink.energy_decay_on_acc(text) OWNER TO supabase_admin;
ALTER FUNCTION yuplink.energy_decay_from_acc(text, timestamptz, numeric, numeric) OWNER TO supabase_admin;
COMMIT;
