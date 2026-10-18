-- DARAI из NFT-холдеров на счёте (владелец + Архан, 16.10.2026, ПРАВИЛА §8.51).
--
-- Внутри игры ими пользуются как обычными, без комиссии. При выводе из игры —
-- ждать 7 или 30 дней (по NFT) и 5 % комиссии; обычные DARAI выводятся как раньше.
-- Метка holder_darai — сколько DARAI на счёте пришло из холдеров — уходит
-- ПОСЛЕДНЕЙ: трата и вывод сначала берут обычные DARAI. Трата в игре метку гасит;
-- оплата другому игроку уносит её с собой: перебитая ставка аукциона — назад,
-- выигравшая — продавцу (иначе твин вывел бы холдерские DARAI без комиссии).
-- Вывод мимо holder_withdraw_request, задевающий метку, база не пускает.
BEGIN;

CREATE TABLE IF NOT EXISTS yuplink.holder_darai (
  account_id text PRIMARY KEY REFERENCES yuplink.accounts(id),
  d7         numeric(38,8) NOT NULL DEFAULT 0 CHECK (d7 >= 0),
  d30        numeric(38,8) NOT NULL DEFAULT 0 CHECK (d30 >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Метка, ушедшая с оплатой (ключ — ref строки списания): ждёт возврата или получателя.
CREATE TABLE IF NOT EXISTS yuplink.holder_darai_float (
  ref        text PRIMARY KEY,
  account_id text NOT NULL,
  amount     numeric(38,8) NOT NULL,
  d7         numeric(38,8) NOT NULL DEFAULT 0,
  d30        numeric(38,8) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION yuplink.holder_darai_add(p_account text, p7 numeric, p30 numeric)
RETURNS void LANGUAGE sql AS $fn$
  INSERT INTO yuplink.holder_darai AS h (account_id, d7, d30)
  SELECT p_account, p7, p30 WHERE p7 + p30 > 0
  ON CONFLICT (account_id) DO UPDATE
    SET d7 = h.d7 + EXCLUDED.d7, d30 = h.d30 + EXCLUDED.d30, updated_at = now();
$fn$;

-- Следом за каждой строкой счёта в DARAI.
CREATE OR REPLACE FUNCTION yuplink.holder_darai_follow() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE v7 numeric; v30 numeric; v_plain numeric; v_take numeric; t7 numeric; t30 numeric;
        f yuplink.holder_darai_float%ROWTYPE; v_bid text; v_share numeric;
BEGIN
  IF NEW.delta < 0 THEN
    SELECT d7, d30 INTO v7, v30 FROM yuplink.holder_darai WHERE account_id = NEW.account_id FOR UPDATE;
    IF NOT FOUND OR v7 + v30 <= 0 THEN RETURN NEW; END IF;
    -- обычных DARAI до списания; метка тратится только сверх них
    v_plain := GREATEST(0, NEW.balance_after - NEW.delta - v7 - v30);
    v_take := LEAST(v7 + v30, GREATEST(0, -NEW.delta - v_plain));
    IF v_take <= 0 THEN RETURN NEW; END IF;
    IF NEW.kind = 'acc_withdraw' AND NEW.ref NOT LIKE 'wdh:%' THEN
      RAISE EXCEPTION 'holder_darai_withdraw:%', v_take;
    END IF;
    t7 := LEAST(v7, v_take);
    t30 := v_take - t7;
    UPDATE yuplink.holder_darai SET d7 = d7 - t7, d30 = d30 - t30, updated_at = now()
     WHERE account_id = NEW.account_id;
    IF NEW.kind <> 'acc_withdraw' THEN
      INSERT INTO yuplink.holder_darai_float (ref, account_id, amount, d7, d30)
      VALUES (NEW.ref, NEW.account_id, -NEW.delta, t7, t30) ON CONFLICT (ref) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  -- Зачисление: возврат той же оплаты или выплата продавцу аукциона. Сбой здесь
  -- не должен ронять движение денег игрока — только предупреждение в журнал.
  BEGIN
    IF NEW.ref LIKE '%-undo' THEN
      SELECT * INTO f FROM yuplink.holder_darai_float
       WHERE ref = left(NEW.ref, length(NEW.ref) - 5) AND account_id = NEW.account_id FOR UPDATE;
    ELSIF NEW.ref LIKE 'gauclot:%:pay' THEN
      SELECT b.charge_ref INTO v_bid FROM yuplink.auction_bid b
       WHERE b.auction_id = split_part(NEW.ref, ':', 2) AND b.active
       ORDER BY b.amount DESC, b.created_at ASC, b.id ASC LIMIT 1;
      IF v_bid IS NOT NULL THEN
        SELECT * INTO f FROM yuplink.holder_darai_float WHERE ref = v_bid FOR UPDATE;
      END IF;
    END IF;
    IF f.ref IS NULL THEN RETURN NEW; END IF;
    -- доля метки — по доле оплаты, что дошла до получателя (комиссия аукциона — игре)
    v_share := LEAST(1, NEW.delta / NULLIF(f.amount, 0));
    PERFORM yuplink.holder_darai_add(NEW.account_id, round(f.d7 * v_share, 8), round(f.d30 * v_share, 8));
    DELETE FROM yuplink.holder_darai_float WHERE ref = f.ref;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'holder_darai_follow: %', SQLERRM;
  END;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS holder_darai_follow ON yuplink.acc_ledger;
CREATE TRIGGER holder_darai_follow AFTER INSERT ON yuplink.acc_ledger
  FOR EACH ROW WHEN (NEW.token = 'Darai') EXECUTE FUNCTION yuplink.holder_darai_follow();

-- ── Вывод DARAI холдеров: ждёт срок, потом заявка в обычную очередь выплат ──
CREATE TABLE IF NOT EXISTS yuplink.holder_withdraw (
  id            text PRIMARY KEY,
  account_id    text NOT NULL REFERENCES yuplink.accounts(id),
  wallet        text,
  recipient     text NOT NULL,
  days          integer NOT NULL CHECK (days IN (7, 30)),
  holder        numeric(38,8) NOT NULL CHECK (holder >= 0),
  gross         numeric(38,8) NOT NULL CHECK (gross > 0),
  fee           numeric(38,8) NOT NULL CHECK (fee >= 0),
  payout        numeric(38,8) NOT NULL CHECK (payout >= 0),
  release_at    timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'released', 'cancelled')),
  redemption_id text,
  booked        boolean NOT NULL DEFAULT false,
  op_ref        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  released_at   timestamptz,
  UNIQUE (op_ref, days)
);
CREATE INDEX IF NOT EXISTS holder_withdraw_waiting ON yuplink.holder_withdraw (release_at) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS holder_withdraw_acc ON yuplink.holder_withdraw (account_id, created_at DESC);

-- Заявка на вывод DARAI со счёта с меткой: обычные — заявкой сразу (acc_withdraw_request),
-- холдерские — списываются сейчас и ждут срок. Строки: 'now' — заявка, 7/30 — ожидание.
CREATE OR REPLACE FUNCTION yuplink.holder_withdraw_request(
  p_account text, p_wallet text, p_amount numeric, p_recipient text, p_idk text)
RETURNS TABLE(days integer, id text, payout numeric, release_at timestamptz)
LANGUAGE plpgsql AS $fn$
#variable_conflict use_column
DECLARE v_ref text; v_bal numeric; v7 numeric; v30 numeric; n7 numeric; n30 numeric;
        v_plain numeric; v_p numeric; v_h numeric; v_free numeric; v_rid text; g7 numeric; g30 numeric;
BEGIN
  v_ref := COALESCE(NULLIF(btrim(p_idk), ''), replace(gen_random_uuid()::text, '-', ''));
  PERFORM pg_advisory_xact_lock(hashtext('acc:' || p_account));
  IF NOT EXISTS (SELECT 1 FROM yuplink.holder_withdraw h WHERE h.op_ref = v_ref) THEN
    SELECT COALESCE(sum(l.delta), 0) INTO v_bal FROM yuplink.acc_ledger l
     WHERE l.account_id = p_account AND l.token = 'Darai';
    SELECT h.d7, h.d30 INTO v7, v30 FROM yuplink.holder_darai h WHERE h.account_id = p_account;
    v7 := COALESCE(v7, 0); v30 := COALESCE(v30, 0);
    IF p_amount > v_bal THEN RAISE EXCEPTION 'not_enough_currency:Darai:%:%', v_bal, p_amount; END IF;
    v_plain := GREATEST(0, v_bal - v7 - v30);
    v_p := LEAST(p_amount, floor(v_plain));
    IF v_p > 0 THEN
      SELECT w.redemption_id INTO v_rid
        FROM yuplink.acc_withdraw_request(p_account, p_wallet, 'Darai', v_p, p_recipient, v_ref) w;
    END IF;
    v_h := p_amount - v_p;
    IF v_h > 0 THEN
      PERFORM * FROM yuplink.acc_move(p_account, 'Darai', -v_h, 'acc_withdraw', 'wdh:' || v_ref, p_wallet);
      SELECT h.d7, h.d30 INTO n7, n30 FROM yuplink.holder_darai h WHERE h.account_id = p_account;
      n7 := v7 - n7; n30 := v30 - n30; -- сколько метки ушло в вывод
      v_free := v_h - n7 - n30;          -- дробный хвост обычных — с первой частью
      g7 := n7 + CASE WHEN n7 > 0 OR n30 = 0 THEN v_free ELSE 0 END;
      g30 := n30 + CASE WHEN n7 > 0 OR n30 = 0 THEN 0 ELSE v_free END;
      INSERT INTO yuplink.holder_withdraw
        (id, account_id, wallet, recipient, days, holder, gross, fee, payout, release_at, op_ref)
      SELECT 'hw_' || substr(md5(v_ref || ':' || x.d), 1, 22), p_account, p_wallet, p_recipient, x.d,
             x.h, x.g, x.g - floor(x.g - x.h * 0.05), floor(x.g - x.h * 0.05),
             now() + make_interval(days => x.d), v_ref
        FROM (VALUES (7, n7, g7), (30, n30, g30)) AS x(d, h, g)
       WHERE x.g > 0;
    END IF;
  ELSE
    SELECT r.id INTO v_rid FROM yuplink.redemptions r
     WHERE r.id = 'w_' || substr(md5(p_account || ':wd:' || v_ref), 1, 24);
  END IF;
  RETURN QUERY
    SELECT 0, v_rid, NULL::numeric, NULL::timestamptz WHERE v_rid IS NOT NULL
    UNION ALL
    SELECT h.days, h.id, h.payout, h.release_at FROM yuplink.holder_withdraw h WHERE h.op_ref = v_ref;
END $fn$;

-- Срок прошёл: заявка в обычную очередь выплат (дальше её везёт конвейер вывода).
CREATE OR REPLACE FUNCTION yuplink.holder_withdraw_release(p_id text)
RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE h yuplink.holder_withdraw%ROWTYPE; v_ft text; v_dec int; v_rid text;
BEGIN
  SELECT * INTO h FROM yuplink.holder_withdraw WHERE id = p_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR h.status <> 'waiting' OR h.release_at > now() THEN RETURN false; END IF;
  IF h.payout > 0 THEN
    SELECT t.ft_contract, t.decimals INTO v_ft, v_dec FROM yuplink.reward_tokens t WHERE t.symbol = 'Darai';
    v_rid := 'w_' || substr(md5(h.id), 1, 24);
    INSERT INTO yuplink.redemptions
      (id, contract_id, token_id, campaign_id, wallet, amount, status,
       reward_token, ft_contract, decimals, ticket_cost, account_id, redeemed_at)
    VALUES (v_rid, 'acct', 'acct:' || v_rid, NULL, h.recipient, h.payout, 'pending',
            'Darai', v_ft, v_dec, 0, h.account_id, now())
    ON CONFLICT (id) DO NOTHING;
  END IF;
  UPDATE yuplink.holder_withdraw SET status = 'released', released_at = now(), redemption_id = v_rid,
         booked = booked OR fee <= 0
   WHERE id = h.id;
  RETURN true;
END $fn$;

-- Передумал, пока ждёт: всё назад на счёт, метка — назад.
CREATE OR REPLACE FUNCTION yuplink.holder_withdraw_cancel(p_id text, p_account text)
RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE h yuplink.holder_withdraw%ROWTYPE;
BEGIN
  SELECT * INTO h FROM yuplink.holder_withdraw WHERE id = p_id AND account_id = p_account FOR UPDATE;
  IF NOT FOUND OR h.status <> 'waiting' THEN RETURN false; END IF;
  PERFORM * FROM yuplink.acc_move(h.account_id, 'Darai', h.gross, 'acc_refund', 'wdh:' || h.id || ':cancel', h.wallet);
  PERFORM yuplink.holder_darai_add(h.account_id, CASE WHEN h.days = 7 THEN h.holder ELSE 0 END,
                                   CASE WHEN h.days = 30 THEN h.holder ELSE 0 END);
  UPDATE yuplink.holder_withdraw SET status = 'cancelled' WHERE id = h.id;
  RETURN true;
END $fn$;

COMMIT;
