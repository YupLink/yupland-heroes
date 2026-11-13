-- Тает ТОЛЬКО подаренная админом энергия (правило владельца, 21.09.2026).
--
-- acc-45 считал «купленным» (не тающим) лишь паки/маркет/лайки, а энергию из
-- боксов (energy_mystic), дропов (energy_drop), наград и шахт относил к
-- подаркам — и она таяла. Владелец: «энергия должна идти в минус, только если
-- получена из подарка (выдана админом); за боксы, дропы или купленная — не
-- должна списываться». Жалоба игрока: 700 своей энергии из NFT-боксов
-- плюс подарок 10 000 — таяние дошло до её собственной.
--
-- Теперь защищено ВСЁ, кроме админских видов (GIFT_KINDS) и естественного
-- регена/стартовых 30 (они и так под лимитом). Свёртка bought пересчитана по
-- леджеру заново (v2), и тем, у кого таяние успело съесть защищённое, разница
-- возвращена (kind energy_decay_refund, защищённая). Идемпотентно по маркеру.
--
-- Порядок: тяжёлая свёртка — во временную таблицу ДО транзакции (см. acc-45).
SET work_mem = '256MB';
DROP TABLE IF EXISTS energy_bought_v2;
CREATE TEMP TABLE energy_bought_v2 AS
WITH lstart AS (SELECT min(created_at) AS t0 FROM yuplink.currency_ledger WHERE token = 'Energy'),
pre AS (
  SELECT p.account_id, sum(p.amount) AS p0
    FROM yuplink.energy_pack_purchases p, lstart
   WHERE p.account_id IS NOT NULL AND p.created_at < lstart.t0
   GROUP BY 1),
rows_ AS (
  SELECT account_id, created_at, kind, delta,
         -- Защищённое: любое положительное начисление, кроме админских
         -- подарков и естественного (реген, стартовые 30).
         (delta > 0 AND kind NOT IN ('energy_admin', 'admin_grant', 'energy_grant', 'energy_gift',
                                     'energy_compensation', 'energy_tester',
                                     'energy_regen', 'energy_opening',
                                     'energy_decay_refund')) AS is_prot,
         kind = 'energy_decay' AS is_decay
    FROM yuplink.currency_ledger
   WHERE token = 'Energy'),
opening AS (SELECT account_id, sum(delta) AS op FROM rows_ WHERE kind = 'energy_opening' GROUP BY 1),
adj AS (
  SELECT o.account_id, LEAST(COALESCE(p.p0, 0), o.op) AS p0eff
    FROM opening o LEFT JOIN pre p USING (account_id)),
g AS (
  SELECT r.account_id,
         -- Свёртка С таянием: подарки и траты (и таяние) едят подарочное первым.
         sum(CASE WHEN r.is_prot THEN 0 ELSE r.delta END)
           OVER (PARTITION BY r.account_id ORDER BY r.created_at, r.kind ROWS UNBOUNDED PRECEDING)
           - COALESCE(a.p0eff, 0) AS g_run,
         -- Та же свёртка БЕЗ таяния: сколько защищённого было бы без него.
         sum(CASE WHEN r.is_prot OR r.is_decay THEN 0 ELSE r.delta END)
           OVER (PARTITION BY r.account_id ORDER BY r.created_at, r.kind ROWS UNBOUNDED PRECEDING)
           - COALESCE(a.p0eff, 0) AS g_run_nodecay,
         sum(CASE WHEN r.is_prot THEN r.delta ELSE 0 END) OVER (PARTITION BY r.account_id)
           + COALESCE(a.p0eff, 0) AS p_total
    FROM rows_ r LEFT JOIN adj a USING (account_id)),
b AS (
  SELECT account_id,
         GREATEST(0, max(p_total) + LEAST(0, min(g_run))) AS bought,
         GREATEST(0, max(p_total) + LEAST(0, min(g_run_nodecay))) AS bought_nodecay
    FROM g GROUP BY 1)
SELECT account_id, bought, bought_nodecay,
       -- Защищённое, съеденное таянием: вернуть.
       GREATEST(0, bought_nodecay - bought) AS eaten
  FROM b;
RESET work_mem;

BEGIN;
SET lock_timeout = '5s';

-- 1. energy_add_acc: защищено всё, кроме админских подарков и естественного.
CREATE OR REPLACE FUNCTION yuplink.energy_add_acc(
  p_account text, p_amount numeric, p_kind text DEFAULT 'energy_add', p_ref text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  -- Тает только это (выдано админом): подарки, гранты, компенсации, тестовое.
  GIFT_KINDS CONSTANT text[] := ARRAY['energy_admin', 'admin_grant', 'energy_grant', 'energy_gift',
                                      'energy_compensation', 'energy_tester'];
  -- Естественное — под лимитом, в защищённое не считается.
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
    VALUES (p_account, NULL, 30 + p_amount, 30, now(),
            CASE WHEN v_prot THEN GREATEST(0, p_amount) ELSE 0 END);
    PERFORM yuplink.energy_log_acc(p_account, 30, 'energy_opening', 'opening:' || p_account);
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
    -- Подаренного не осталось — значит, трата ушла из защищённого; возвращаем
    -- туда же.
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

-- 2. Пересчёт bought (v2) и возврат съеденного таянием — один раз по маркеру.
WITH mark AS (
  INSERT INTO yuplink.settings(key, value)
  VALUES ('energy_decay_backfill_v2', now()::text)
  ON CONFLICT (key) DO NOTHING
  RETURNING key),
fix AS (
  UPDATE yuplink.user_energy e
     SET energy = ROUND(e.energy + COALESCE(b.eaten, 0), 2),
         bought = LEAST(ROUND(e.energy + COALESCE(b.eaten, 0), 2), COALESCE(b.bought_nodecay, 0)),
         last_updated_at = CASE
           -- Перестал таять (энергия ≤ лимит + защищённое) — часы с этого момента.
           WHEN e.energy + COALESCE(b.eaten, 0) <= e.max_energy + e.hero_max_bonus
                + LEAST(e.energy + COALESCE(b.eaten, 0), COALESCE(b.bought_nodecay, 0))
           THEN now() ELSE e.last_updated_at END
    FROM yuplink.user_energy ue LEFT JOIN energy_bought_v2 b ON b.account_id = ue.account_id
   WHERE ue.account_id = e.account_id
     AND EXISTS (SELECT 1 FROM mark)
  RETURNING e.account_id, COALESCE(b.eaten, 0) AS eaten)
INSERT INTO yuplink.currency_ledger(id, account_id, wallet, token, delta, kind, ref, created_at)
SELECT 'cl_' || substr(md5(random()::text || account_id), 1, 14), account_id, NULL, 'Energy',
       eaten, 'energy_decay_refund', 'decay-refund-v2:' || account_id, now()
  FROM fix WHERE eaten > 0;

COMMIT;
DROP TABLE IF EXISTS energy_bought_v2;

-- Контроль (SELECT):
--   SELECT key, value FROM yuplink.settings WHERE key LIKE 'energy_decay%';
--   SELECT count(*), sum(delta) FROM yuplink.currency_ledger WHERE kind = 'energy_decay_refund';
--   SELECT count(*) FILTER (WHERE energy > max_energy + hero_max_bonus + bought) AS decaying,
--          round(sum(bought)) AS bought_total FROM yuplink.user_energy;
--   Дрейф леджер ↔ user_energy обязан остаться 0.
