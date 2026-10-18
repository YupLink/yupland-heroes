// Ставка одной SQL-функцией: замок лота → проверка минимума → списание → запись
// ставки → возврат вытесненным. Всё в одной транзакции, поэтому гонки «вернули
// ставку, а она потом заняла лот» нет. У игрока одна активная ставка — повышение
// возвращает прежнюю. Валюта лота (auction.currency):
//   символ токена (Darai, USDT…) → основной счёт, yuplink.acc_move;
//   'res:gold' / 'res:stone' / 'res:wood' / 'res:diamonds' → ресурсы, res_move;
//   'energy' → энергия: списание energy_touch_acc, возврат energy_add_acc.
// Возврат — ключом «<charge_ref>-undo»; отметка refunded ставится в той же
// транзакции, что и деньги (auction_refund_bid), — у энергии своей защиты от
// повтора нет, поэтому ровно один раз гарантирует именно это.
// v3: на свой лот (аукционный дом игрока) ставить нельзя — 'own_lot'.
// v4: дом до 10 уровня, комиссия лота по уровню (fee_pct) — house-fn.ts.
// v5: лотов разом = уровню дома (до 10).

import { HOUSE_MIGRATIONS } from "./house-fn";

export const AUCTION_FN_VERSION = "auction-bid v5";

/** Движение валюты аукциона: минус — ставка, плюс — возврат. */
const MONEY_FN = `CREATE OR REPLACE FUNCTION yuplink.auction_money(
  p_currency text, p_account text, p_wallet text, p_delta numeric, p_ref text
) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  IF p_currency = 'energy' THEN
    IF p_delta < 0 THEN
      PERFORM * FROM yuplink.energy_touch_acc(p_account, -p_delta);
    ELSE
      PERFORM yuplink.energy_add_acc(p_account, p_delta, 'energy_refund', p_ref);
    END IF;
  ELSIF p_currency LIKE 'res:%' THEN
    PERFORM * FROM yuplink.res_move(p_account, substr(p_currency, 5), p_delta,
      CASE WHEN p_delta < 0 THEN 'auction_bid' ELSE 'auction_refund' END, p_ref);
  ELSE
    PERFORM * FROM yuplink.acc_move(p_account, p_currency, p_delta,
      CASE WHEN p_delta < 0 THEN 'acc_spend' ELSE 'acc_refund' END, p_ref, p_wallet);
  END IF;
END $fn$`;

/** Вернуть ставку, которая не держит лот: деньги + отметка — одной транзакцией. */
const REFUND_FN = `CREATE OR REPLACE FUNCTION yuplink.auction_refund_bid(p_bid text)
RETURNS boolean
LANGUAGE plpgsql AS $fn$
DECLARE
  b     yuplink.auction_bid%ROWTYPE;
  v_cur text;
BEGIN
  SELECT * INTO b FROM yuplink.auction_bid WHERE id = p_bid FOR UPDATE;
  IF NOT FOUND OR b.refunded OR b.active THEN RETURN false; END IF;
  SELECT currency INTO v_cur FROM yuplink.auction WHERE id = b.auction_id;
  PERFORM yuplink.auction_money(v_cur, b.account_id, b.wallet, b.amount, b.charge_ref || '-undo');
  UPDATE yuplink.auction_bid SET refunded = true WHERE id = p_bid;
  RETURN true;
END $fn$`;

const BID_FN = `CREATE OR REPLACE FUNCTION yuplink.auction_place_bid(
  p_auction text, p_bid_id text, p_account text, p_wallet text,
  p_amount numeric, p_charge_ref text
) RETURNS TABLE(o_result text, o_end_at timestamptz)
LANGUAGE plpgsql AS $fn$
DECLARE
  a        yuplink.auction%ROWTYPE;
  v_mine   yuplink.auction_bid%ROWTYPE;
  v_out    yuplink.auction_bid%ROWTYPE;
  v_others integer;
  v_cut    numeric;
  v_req    numeric;
  v_lock   text;
BEGIN
  SELECT * INTO a FROM yuplink.auction WHERE id = p_auction FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'auction_not_found'; END IF;

  IF EXISTS (SELECT 1 FROM yuplink.auction_bid WHERE charge_ref = p_charge_ref) THEN
    RETURN QUERY SELECT 'duplicate'::text, a.end_at;
    RETURN;
  END IF;

  IF a.status <> 'live' OR a.end_at <= now() THEN RAISE EXCEPTION 'auction_closed'; END IF;
  IF a.seller_account_id = p_account THEN RAISE EXCEPTION 'own_lot'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'bid_too_low:%', a.start_price; END IF;
  IF (a.currency = 'energy' OR a.currency LIKE 'res:%') AND p_amount <> trunc(p_amount) THEN
    RAISE EXCEPTION 'whole_only';
  END IF;

  SELECT * INTO v_mine FROM yuplink.auction_bid b
   WHERE b.auction_id = p_auction AND b.account_id = p_account AND b.active
   ORDER BY b.amount DESC LIMIT 1;

  SELECT count(*) INTO v_others FROM yuplink.auction_bid b
   WHERE b.auction_id = p_auction AND b.active AND b.account_id <> p_account;

  IF v_others >= a.winners THEN
    SELECT b.amount INTO v_cut FROM yuplink.auction_bid b
     WHERE b.auction_id = p_auction AND b.active AND b.account_id <> p_account
     ORDER BY b.amount DESC, b.created_at ASC, b.id ASC
     OFFSET a.winners - 1 LIMIT 1;
    v_req := greatest(ceil(v_cut * (100 + a.min_step_pct) / 100), floor(v_cut) + 1);
  ELSE
    v_req := a.start_price;
  END IF;
  IF v_mine.id IS NOT NULL THEN
    v_req := greatest(v_req, ceil(v_mine.amount * (100 + a.min_step_pct) / 100), floor(v_mine.amount) + 1);
  END IF;
  IF p_amount < v_req THEN RAISE EXCEPTION 'bid_too_low:%', v_req; END IF;

  -- Замки кошельков в одном порядке: ставящий + все держатели лотов. Иначе две
  -- ставки на разных аукционах, вытесняющие друг друга, могли бы сцепиться.
  FOR v_lock IN
    SELECT s.acc FROM (
      SELECT p_account AS acc
      UNION
      SELECT b.account_id FROM yuplink.auction_bid b
       WHERE b.auction_id = p_auction AND b.active
    ) s ORDER BY s.acc
  LOOP
    IF a.currency = 'energy' THEN
      PERFORM 1 FROM yuplink.user_energy WHERE account_id = v_lock FOR UPDATE;
    ELSIF a.currency LIKE 'res:%' THEN
      PERFORM pg_advisory_xact_lock(hashtext('res:' || v_lock));
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('acc:' || v_lock));
    END IF;
  END LOOP;

  PERFORM yuplink.auction_money(a.currency, p_account, p_wallet, -p_amount, p_charge_ref);

  INSERT INTO yuplink.auction_bid (id, auction_id, account_id, wallet, amount, charge_ref, refunded, active)
  VALUES (p_bid_id, p_auction, p_account, p_wallet, p_amount, p_charge_ref, false, true);

  IF v_mine.id IS NOT NULL THEN
    UPDATE yuplink.auction_bid SET active = false, refunded = true WHERE id = v_mine.id;
    PERFORM yuplink.auction_money(a.currency, v_mine.account_id, v_mine.wallet, v_mine.amount,
      v_mine.charge_ref || '-undo');
  END IF;

  FOR v_out IN
    SELECT * FROM yuplink.auction_bid b
     WHERE b.auction_id = p_auction AND b.active
     ORDER BY b.amount DESC, b.created_at ASC, b.id ASC
     OFFSET a.winners
  LOOP
    UPDATE yuplink.auction_bid SET active = false, refunded = true WHERE id = v_out.id;
    PERFORM yuplink.auction_money(a.currency, v_out.account_id, v_out.wallet, v_out.amount,
      v_out.charge_ref || '-undo');
  END LOOP;

  IF a.anti_snipe_min > 0 AND now() > a.end_at - make_interval(mins => a.anti_snipe_min) THEN
    UPDATE yuplink.auction SET end_at = now() + make_interval(mins => a.anti_snipe_min)
     WHERE id = p_auction;
  END IF;

  UPDATE yuplink.auction x
     SET top_bid = t.amount, top_bid_id = t.id, top_account_id = t.account_id,
         top_wallet = t.wallet, top_bid_at = now()
    FROM (SELECT b.id, b.amount, b.account_id, b.wallet FROM yuplink.auction_bid b
           WHERE b.auction_id = p_auction AND b.active
           ORDER BY b.amount DESC, b.created_at ASC, b.id ASC LIMIT 1) t
   WHERE x.id = p_auction;

  RETURN QUERY SELECT 'ok'::text, x.end_at FROM yuplink.auction x WHERE x.id = p_auction;
END $fn$`;

/** Миграция аукциона. Каждая строка — отдельный запрос (идемпотентны). */
export const AUCTION_MULTI_MIGRATIONS: string[] = [
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS winners integer NOT NULL DEFAULT 1",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS series_id text",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS series_no integer",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS series_total integer",
  "ALTER TABLE yuplink.auction_bid ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT false",
  "ALTER TABLE yuplink.auction_bid ADD COLUMN IF NOT EXISTS delivered boolean NOT NULL DEFAULT false",
  "CREATE UNIQUE INDEX IF NOT EXISTS auction_bid_charge_ref_uq ON yuplink.auction_bid (charge_ref)",
  "CREATE INDEX IF NOT EXISTS auction_bid_active_idx ON yuplink.auction_bid (auction_id) WHERE active",
  ...HOUSE_MIGRATIONS,
  MONEY_FN,
  REFUND_FN,
  BID_FN,
  `COMMENT ON FUNCTION yuplink.auction_place_bid(text, text, text, text, numeric, text) IS '${AUCTION_FN_VERSION}'`,
];
