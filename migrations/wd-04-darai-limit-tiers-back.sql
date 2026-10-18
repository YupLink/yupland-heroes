-- Лимит вывода DARAI — снова ступени 10 / 50 / 100 млн (владелец, 16.10.2026: «10/50/100
-- было понятно»). Ступень каждому ставится сама при каждом выводе — по вкладу за 30 дней,
-- то же, что wd-02: USDT и звёзды, потраченные в игре, + DARAI, заведённые сверх выведенных,
-- по живому курсу Ref. От $30 — 100 млн, от $10 — 50 млн, иначе 10 млн в календарный месяц.
CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_cap(p_account text) RETURNS numeric
LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_base numeric; v_tiers jsonb; v_rate numeric; v_usd numeric; v_cap numeric; t jsonb;
BEGIN
  v_base := COALESCE((SELECT NULLIF(value, '')::numeric FROM yuplink.settings
                       WHERE key = 'darai_withdraw_month_limit'), 10000000);
  IF v_base <= 0 THEN RETURN NULL; END IF;  -- 0 — без лимита
  v_tiers := COALESCE((SELECT value::jsonb FROM yuplink.settings WHERE key = 'darai_withdraw_tiers'),
                      '[{"usd":10,"limit":50000000},{"usd":30,"limit":100000000}]'::jsonb);
  v_rate := COALESCE((SELECT (value::jsonb->>'daraiPerUsd')::numeric FROM yuplink.settings
                       WHERE key = 'darai_usd_rate'), 1900000);
  SELECT COALESCE(-sum(delta) FILTER (WHERE token = 'USDT' AND kind IN ('acc_spend', 'acc_refund')), 0)
       + COALESCE(-sum(delta) FILTER (WHERE token = 'STARS' AND kind IN ('acc_spend', 'acc_refund')), 0) * 0.013
       + GREATEST(0, COALESCE(sum(delta) FILTER (WHERE token = 'Darai'
                                                  AND kind IN ('acc_deposit', 'acc_withdraw')), 0)) / v_rate
    INTO v_usd
    FROM yuplink.acc_ledger
   WHERE account_id = p_account AND token IN ('USDT', 'STARS', 'Darai')
     AND created_at > now() - interval '30 days';
  v_cap := v_base;
  FOR t IN SELECT * FROM jsonb_array_elements(v_tiers) LOOP
    IF v_usd >= (t->>'usd')::numeric THEN v_cap := GREATEST(v_cap, (t->>'limit')::numeric); END IF;
  END LOOP;
  RETURN v_cap;
END $fn$;

CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_limit() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE v_cap numeric; v_base numeric; v_used numeric; v_month timestamptz;
BEGIN
  IF NEW.kind <> 'acc_withdraw' OR NEW.token <> 'Darai' OR NEW.delta >= 0 THEN RETURN NEW; END IF;
  v_cap := yuplink.darai_withdraw_cap(NEW.account_id);
  IF v_cap IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('wdlim:' || NEW.account_id));
  v_base := COALESCE((SELECT NULLIF(value, '')::numeric FROM yuplink.settings
                       WHERE key = 'darai_withdraw_month_limit'), 10000000);
  IF v_cap <= v_base AND EXISTS (SELECT 1 FROM yuplink.darai_withdraw_block b
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

INSERT INTO yuplink.settings (key, value)
VALUES ('darai_withdraw_tiers', '[{"usd":10,"limit":50000000},{"usd":30,"limit":100000000}]')
ON CONFLICT (key) DO NOTHING;
