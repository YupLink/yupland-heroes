-- Лимит вывода DARAI — сам и по-честному (владелец, 16.10.2026: «чтобы было динамически и
-- ты сам расставлял лимиты; DARAI считать по курсу — главное, чтобы была честность»).
-- Лимит на календарный месяц (UTC) = 10 млн + что игрок принёс в игру за последние 30 дней:
--   · DARAI, заведённые с кошелька, — один к одному (завёл и вывел обратно — честно, своё);
--   · USDT и звёзды, потраченные в игре (★ × 0,013 $), — в DARAI по живому курсу пула Ref
--     (settings darai_usd_rate, его обновляет сама игра при каждом походе в Ref).
-- Считается в момент каждого вывода по свежим данным — вручную никто ничего не ставит.
-- Блок до 1 ноября (darai_withdraw_block) держит, пока игрок принёс меньше, чем на $10.
CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_cap(p_account text) RETURNS numeric
LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_base numeric; v_rate numeric; v_usd numeric; v_dep numeric;
BEGIN
  v_base := COALESCE((SELECT NULLIF(value, '')::numeric FROM yuplink.settings
                       WHERE key = 'darai_withdraw_month_limit'), 10000000);
  IF v_base <= 0 THEN RETURN NULL; END IF;  -- 0 — без лимита
  v_rate := COALESCE((SELECT (value::jsonb->>'daraiPerUsd')::numeric FROM yuplink.settings
                       WHERE key = 'darai_usd_rate'), 1900000);
  SELECT COALESCE(-sum(delta) FILTER (WHERE token = 'USDT' AND kind IN ('acc_spend', 'acc_refund')), 0)
       + COALESCE(-sum(delta) FILTER (WHERE token = 'STARS' AND kind IN ('acc_spend', 'acc_refund')), 0) * 0.013,
         COALESCE(sum(delta) FILTER (WHERE token = 'Darai' AND kind = 'acc_deposit'), 0)
    INTO v_usd, v_dep
    FROM yuplink.acc_ledger
   WHERE account_id = p_account AND token IN ('USDT', 'STARS', 'Darai')
     AND created_at > now() - interval '30 days';
  RETURN floor(v_base + GREATEST(0, v_dep) + GREATEST(0, v_usd) * v_rate);
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_limit() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE v_cap numeric; v_base numeric; v_rate numeric; v_used numeric; v_month timestamptz;
BEGIN
  IF NEW.kind <> 'acc_withdraw' OR NEW.token <> 'Darai' OR NEW.delta >= 0 THEN RETURN NEW; END IF;
  v_cap := yuplink.darai_withdraw_cap(NEW.account_id);
  IF v_cap IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('wdlim:' || NEW.account_id));
  v_base := COALESCE((SELECT NULLIF(value, '')::numeric FROM yuplink.settings
                       WHERE key = 'darai_withdraw_month_limit'), 10000000);
  v_rate := COALESCE((SELECT (value::jsonb->>'daraiPerUsd')::numeric FROM yuplink.settings
                       WHERE key = 'darai_usd_rate'), 1900000);
  IF v_cap < v_base + 10 * v_rate AND EXISTS (
       SELECT 1 FROM yuplink.darai_withdraw_block b
        WHERE b.account_id = NEW.account_id AND b.until > now()) THEN
    RAISE EXCEPTION 'withdraw_limit:0:%', v_cap;
  END IF;
  v_month := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT COALESCE(-sum(l.delta) FILTER (WHERE l.kind = 'acc_withdraw'), 0)
       - COALESCE(sum(l.delta) FILTER (WHERE l.kind = 'acc_refund'
                    AND (l.ref LIKE 'wd-cancel:%' OR l.ref LIKE 'wdh:%:cancel')), 0)
    INTO v_used
    FROM yuplink.acc_ledger l
   WHERE l.account_id = NEW.account_id AND l.token = 'Darai' AND l.created_at >= v_month
     AND l.kind IN ('acc_withdraw', 'acc_refund');
  IF v_used - NEW.delta > v_cap THEN
    RAISE EXCEPTION 'withdraw_limit:%:%', GREATEST(0, floor(v_cap - v_used)), v_cap;
  END IF;
  RETURN NEW;
END $fn$;

DELETE FROM yuplink.settings WHERE key = 'darai_withdraw_tiers';
