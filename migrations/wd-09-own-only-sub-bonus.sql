-- Доп. вывод по подписке и для «только своё» (владелец, 06.11.2026: «игроку можно тоже выводить с доп
-- лимитами на подписки — это же по факту оплаченное»). Аккаунт из darai_withdraw_own_only выводит заведённое
-- с кошелька (как wd-05) и сверх него — прибавку подписки (darai_withdraw_sub_bonus, wd-08) в календарный
-- месяц. Часть вывода, ушедшая прибавкой, — darai_wd_part.sub: она не тратит заведённое и считается в
-- месячную прибавку; отмена вывода (cancelled_at) возвращает и то, и другое.
-- Тело триггера — с прода 06.11 (= wd-07), правка только в ветке «только своё» и в записи части.
SET lock_timeout = '3s';

ALTER TABLE yuplink.darai_wd_part ADD COLUMN IF NOT EXISTS sub numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION yuplink.darai_withdraw_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_cap numeric; v_base numeric; v_used numeric; v_month timestamptz; v_since timestamptz;
        v_raw numeric; v_rawt numeric; v_clean numeric; v_own_only boolean := false;
        v_sub numeric := 0; v_sub_all numeric; v_sub_month numeric; v_bonus numeric; v_left numeric;
BEGIN
  IF NEW.kind <> 'acc_withdraw' OR NEW.token <> 'Darai' OR NEW.delta >= 0 THEN RETURN NEW; END IF;
  v_base := COALESCE((SELECT NULLIF(value, '')::numeric FROM yuplink.settings
                       WHERE key = 'darai_withdraw_month_limit'), 10000000);
  v_month := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  -- «Только своё» (wd-05): заведённое с кошелька + прибавка подписки (wd-09).
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
    -- Прибавка подписки сверх своего (владелец 06.11.2026: «это же по факту оплаченное») — до
    -- darai_withdraw_sub_bonus в месяц. Что ушло прибавкой — darai_wd_part.sub: своё оно не тратит.
    SELECT COALESCE(sum(p.sub) FILTER (WHERE p.at >= v_since), 0),
           COALESCE(sum(p.sub) FILTER (WHERE p.at >= v_month), 0)
      INTO v_sub_all, v_sub_month
      FROM yuplink.darai_wd_part p
     WHERE p.account_id = NEW.account_id AND p.cancelled_at IS NULL;
    v_used := GREATEST(0, v_used + v_sub_all);
    -- Холдерский вывод (wdh:) части не пишет — прибавкой он не идёт.
    v_bonus := CASE WHEN NEW.ref LIKE 'wdh:%' THEN 0
                    ELSE GREATEST(0, yuplink.darai_withdraw_sub_bonus(NEW.account_id) - v_sub_month) END;
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
      SELECT COALESCE(sum(p.clean), 0) INTO v_used FROM yuplink.darai_wd_part p
       WHERE p.account_id = NEW.account_id AND p.at >= v_month AND p.cancelled_at IS NULL;
      IF v_used + v_clean > v_cap THEN
        RAISE EXCEPTION 'withdraw_limit:%:%', floor(v_raw + GREATEST(0, v_cap - v_used)), v_cap;
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
