-- Прибавка подписки — своя у каждой подписки, сразу при покупке (владелец, 07.11.2026: «нужно чтобы
-- подписка давала + к лимиту сразу же, а уходил лимит (неиспользованного вывода) когда заканчивается
-- подписка … был эксперт на +35 кк, вывел только 30 кк, купил заново эксперта — лимит снова 35 кк,
-- невыведенные 5 кк — это просто возможности к выводу и всё»).
--
-- Было (wd-08/09): прибавка самой старшей действующей подписки — на календарный месяц; купил новую в
-- месяце, где прибавку уже вывел, — ничего. Подписка через 1-е число давала прибавку дважды.
-- Стало: у каждой подписки свой запас = её прибавка на её 30 дней (выданная админом дольше — на каждые
-- 30 дней). Доступно = самый большой остаток из действующих (не сумма, как wd-08): что ушло прибавкой
-- с начала её 30 дней — darai_wd_part.sub. Кончилась подписка — остаток сгорел. Обычный лимит месяца
-- (darai_withdraw_cap без прибавки) — прежний, календарный; вывод берёт сначала его, потом прибавку.
-- «Только своё» (wd-09) — тот же запас подписки вместо месячного.
SET lock_timeout = '3s';

-- Остаток прибавки: самый большой из действующих подписок.
CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_sub_left(p_account text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(max(GREATEST(0, t.withdraw_bonus - COALESCE((
           SELECT sum(p.sub) FROM yuplink.darai_wd_part p
            WHERE p.account_id = p_account AND p.cancelled_at IS NULL
              AND p.at >= s.starts_at
                        + floor(extract(epoch FROM now() - s.starts_at) / 2592000) * interval '30 days'
         ), 0))), 0)
    FROM yuplink.energy_sub s
    JOIN yuplink.energy_sub_tier t ON t.id = s.tier_id
   WHERE s.account_id = p_account AND s.starts_at <= now() AND s.ends_at > now()
$function$;

CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_cap numeric; v_base numeric; v_used numeric; v_month timestamptz; v_since timestamptz;
        v_raw numeric; v_rawt numeric; v_clean numeric; v_own_only boolean := false;
        v_sub numeric := 0; v_sub_all numeric; v_bonus numeric; v_left numeric; v_room numeric;
BEGIN
  IF NEW.kind <> 'acc_withdraw' OR NEW.token <> 'Darai' OR NEW.delta >= 0 THEN RETURN NEW; END IF;
  v_base := COALESCE((SELECT NULLIF(value, '')::numeric FROM yuplink.settings
                       WHERE key = 'darai_withdraw_month_limit'), 10000000);
  v_month := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  -- «Только своё» (wd-05): заведённое с кошелька + запас подписки (wd-09, wd-10).
  SELECT o.since INTO v_since FROM yuplink.darai_withdraw_own_only o WHERE o.account_id = NEW.account_id;
  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtext('wdlim:' || NEW.account_id));
    SELECT COALESCE(sum(l.delta) FILTER (WHERE l.kind IN ('acc_deposit', 'acc_withdraw')), 0)
         + COALESCE(sum(l.delta) FILTER (WHERE l.kind = 'acc_refund'
                      AND (l.ref LIKE 'wd-cancel:%' OR l.ref LIKE 'wdh:%:cancel')), 0)
      INTO v_used
      FROM yuplink.acc_ledger l
     WHERE l.account_id = NEW.account_id AND l.token = 'Darai' AND l.created_at >= v_since
       AND l.kind IN ('acc_deposit', 'acc_withdraw', 'acc_refund');
    -- Что ушло прибавкой (darai_wd_part.sub), своё не тратит.
    SELECT COALESCE(sum(p.sub), 0) INTO v_sub_all
      FROM yuplink.darai_wd_part p
     WHERE p.account_id = NEW.account_id AND p.cancelled_at IS NULL AND p.at >= v_since;
    v_used := GREATEST(0, v_used + v_sub_all);
    -- Холдерский вывод (wdh:) части не пишет — прибавкой он не идёт.
    v_bonus := CASE WHEN NEW.ref LIKE 'wdh:%' THEN 0
                    ELSE yuplink.darai_withdraw_sub_left(NEW.account_id) END;
    IF -NEW.delta > v_used + v_bonus THEN
      v_left := yuplink.darai_withdraw_sub_bonus(NEW.account_id);
      RAISE EXCEPTION 'withdraw_limit:%:%', floor(v_used + v_bonus),
        CASE WHEN v_left > 0 THEN v_left ELSE GREATEST(v_base, 0) END;
    END IF;
    v_sub := GREATEST(0, -NEW.delta - v_used);
    -- Учёт заведённых ведём и здесь: уберут из списка — заработанное не выйдет «своим».
    v_own_only := true;
  END IF;
  -- Холдерские: комиссия 5 % и срок (holder_withdraw_request), месячный лимит их не считает.
  IF NEW.ref LIKE 'wdh:%' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('wdlim:' || NEW.account_id));
  SELECT r.amount INTO v_raw FROM yuplink.darai_raw r WHERE r.account_id = NEW.account_id FOR UPDATE;
  v_raw := COALESCE(v_raw, 0);
  v_rawt := LEAST(v_raw, -NEW.delta);
  v_clean := -NEW.delta - v_rawt;
  IF v_clean > 0 AND NOT v_own_only THEN
    v_cap := yuplink.darai_withdraw_cap(NEW.account_id);
    IF v_cap IS NOT NULL THEN
      IF v_cap <= v_base AND EXISTS (SELECT 1 FROM yuplink.darai_withdraw_block b
                                      WHERE b.account_id = NEW.account_id AND b.until > now()) THEN
        RAISE EXCEPTION 'withdraw_limit:%:%', floor(v_raw), v_cap;
      END IF;
      -- Обычный лимит месяца (без прибавки) — первым; сверх него — запас подписки (wd-10).
      SELECT COALESCE(sum(GREATEST(0, p.clean - p.sub)), 0) INTO v_used FROM yuplink.darai_wd_part p
       WHERE p.account_id = NEW.account_id AND p.at >= v_month AND p.cancelled_at IS NULL;
      v_room := GREATEST(0, v_cap - yuplink.darai_withdraw_sub_bonus(NEW.account_id) - v_used);
      v_sub := GREATEST(0, v_clean - v_room);
      IF v_sub > 0 THEN
        v_left := yuplink.darai_withdraw_sub_left(NEW.account_id);
        IF v_sub > v_left THEN
          RAISE EXCEPTION 'withdraw_limit:%:%', floor(v_raw + v_room + v_left), v_cap;
        END IF;
      END IF;
    END IF;
  END IF;
  IF v_rawt > 0 THEN
    UPDATE yuplink.darai_raw SET amount = amount - v_rawt, updated_at = now()
     WHERE account_id = NEW.account_id;
  END IF;
  -- Ключ заявки — тот же, что у acc_withdraw_request: отмена найдёт её по 'wd-cancel:<id>'.
  INSERT INTO yuplink.darai_wd_part (id, account_id, raw, clean, sub)
  VALUES ('w_' || substr(md5(NEW.account_id || ':' || NEW.ref), 1, 24), NEW.account_id, v_rawt, v_clean,
          v_sub)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $function$;

-- Ноябрьские выводы обычных аккаунтов (прибавка wd-08 — с 01.11): часть сверх обычного лимита месяца
-- шла прибавкой — пишем её в sub, чтобы запас подписки, действовавшей тогда, не выдался второй раз.
-- На 07.11 таких 5 аккаунтов, у всех обычный лимит 10 млн. Повтор ничего не меняет.
WITH nov AS (
  SELECT p.id, p.account_id, p.sub,
         sum(p.clean) OVER (PARTITION BY p.account_id ORDER BY p.at, p.id) AS cum, p.clean
    FROM yuplink.darai_wd_part p
   WHERE p.at >= '2026-11-01 00:00:00+00' AND p.cancelled_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM yuplink.darai_withdraw_own_only o WHERE o.account_id = p.account_id)
), c0 AS (
  SELECT a.account_id,
         yuplink.darai_withdraw_cap(a.account_id) - yuplink.darai_withdraw_sub_bonus(a.account_id) AS cap
    FROM (SELECT DISTINCT account_id FROM nov) a
), calc AS (
  SELECT n.id, GREATEST(0, n.cum - c0.cap) - GREATEST(0, n.cum - n.clean - c0.cap) AS sub
    FROM nov n JOIN c0 USING (account_id)
   WHERE c0.cap IS NOT NULL AND n.sub = 0
)
UPDATE yuplink.darai_wd_part p SET sub = calc.sub FROM calc WHERE p.id = calc.id AND calc.sub > 0;
