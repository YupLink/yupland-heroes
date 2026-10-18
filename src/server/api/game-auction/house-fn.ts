// SQL аукционного дома: постройка/улучшение, бронь слота под лот игрока и
// выплата продавцу. Правила — lib/auctionHouse.ts (слоты и комиссия здесь
// повторены — менять вместе). Накатывает ensureBidFunction вместе с функцией
// ставки (bid-fn.ts).
import {
  FEE_BY_LEVEL,
  HOUSE_MAX_LEVEL,
  HOUSE_MAX_SLOTS,
  SOLD_SLOT_HOURS,
} from "@/lib/auctionHouse";

/** Лоты, выставленные до шкалы комиссий (14.10), — по прежним 10 %. */
const LEGACY_FEE_PCT = 10;
/** Комиссия с этих валют делится как оплата подписки (settle-player.bookFee). */
export const FEE_TOKENS = ["Darai", "USDT", "STARS"] as const;

/** Слот занят: лот открыт (или вещь как раз уходит в залог) либо продан меньше суток назад. */
export const BUSY_SLOT_SQL = `(a.status IN ('escrow', 'live')
  OR (a.status = 'settled' AND a.winner_account_id IS NOT NULL
      AND a.closed_at > now() - interval '${SOLD_SLOT_HOURS} hours'))`;

/** Улучшение: под замком аккаунта, ресурсы — res_move (не в минус), повтор по p_op — без списания. */
const UPGRADE_FN = `CREATE OR REPLACE FUNCTION yuplink.castle_auction_house_upgrade(
  p_account text, p_from integer, p_cost jsonb, p_op text
) RETURNS TABLE(level integer, applied boolean)
LANGUAGE plpgsql AS $fn$
DECLARE v_level integer; v_res text; v_amt numeric;
BEGIN
  IF p_account IS NULL OR p_account = '' OR p_op IS NULL OR p_op = '' THEN RAISE EXCEPTION 'house_bad_args'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('auchouse:' || p_account));
  INSERT INTO yuplink.castle_auction_house(account_id) VALUES (p_account) ON CONFLICT (account_id) DO NOTHING;
  SELECT h.level INTO v_level FROM yuplink.castle_auction_house h WHERE h.account_id = p_account FOR UPDATE;
  IF EXISTS (SELECT 1 FROM yuplink.castle_auction_house_op o WHERE o.op_id = p_op) THEN
    RETURN QUERY SELECT v_level, false; RETURN;
  END IF;
  IF v_level <> p_from THEN RAISE EXCEPTION 'house_level_moved:%', v_level; END IF;
  IF v_level >= ${HOUSE_MAX_LEVEL} THEN RAISE EXCEPTION 'house_max_level'; END IF;
  FOR v_res IN SELECT unnest(ARRAY['wood','stone','gold','diamonds']) LOOP
    v_amt := COALESCE((p_cost->>v_res)::numeric, 0);
    IF v_amt < 0 THEN RAISE EXCEPTION 'house_bad_cost'; END IF;
    IF v_amt > 0 THEN
      PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'auction_house', 'auchouse:' || p_op || ':' || v_res);
    END IF;
  END LOOP;
  UPDATE yuplink.castle_auction_house SET level = v_level + 1, updated_at = now() WHERE account_id = p_account;
  INSERT INTO yuplink.castle_auction_house_op(op_id, account_id, detail)
    VALUES (p_op, p_account, jsonb_build_object('from', v_level, 'cost', p_cost));
  RETURN QUERY SELECT v_level + 1, true;
END $fn$`;

/**
 * Бронь слота: под замком аккаунта считаем занятые слоты и заводим лот в статусе
 * 'escrow' — вещь ещё не взята. Взятие залога и выход в 'live' — escrow.ts.
 * Повтор того же нажатия (тот же id лота) — 'duplicate', без второй брони.
 * Комиссия лота — по уровню дома в момент брони (fee_pct), дальше не меняется.
 */
const OPEN_FN = `CREATE OR REPLACE FUNCTION yuplink.auction_house_open(
  p_account text, p_wallet text, p_auction text, p_kind text, p_ref text, p_qty integer,
  p_title text, p_currency text, p_start numeric, p_hours integer, p_escrow jsonb
) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE v_level integer; v_busy integer; v_fee numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('auchouse:' || p_account));
  IF EXISTS (SELECT 1 FROM yuplink.auction WHERE id = p_auction) THEN RETURN 'duplicate'; END IF;
  SELECT h.level INTO v_level FROM yuplink.castle_auction_house h WHERE h.account_id = p_account;
  IF COALESCE(v_level, 0) < 1 THEN RAISE EXCEPTION 'house_needed'; END IF;
  SELECT count(*) INTO v_busy FROM yuplink.auction a
   WHERE a.seller_account_id = p_account AND ${BUSY_SLOT_SQL};
  IF v_busy >= LEAST(v_level, ${HOUSE_MAX_SLOTS}) THEN
    RAISE EXCEPTION 'house_no_slot:%', LEAST(v_level, ${HOUSE_MAX_SLOTS});
  END IF;
  v_fee := (ARRAY[${FEE_BY_LEVEL.join(", ")}])[LEAST(v_level, ${HOUSE_MAX_LEVEL})];
  INSERT INTO yuplink.auction
    (id, title, prize_kind, prize_ref, prize_qty, currency, start_price, min_step_pct,
     anti_snipe_min, start_at, end_at, status, created_by, source, seller_account_id,
     seller_wallet, escrow, fee_pct)
  VALUES (p_auction, p_title, p_kind, p_ref, p_qty, p_currency, p_start, 5, 5, now(),
          now() + make_interval(hours => p_hours), 'escrow', p_wallet, 'player', p_account,
          p_wallet, p_escrow, v_fee);
  RETURN 'ok';
END $fn$`;

/**
 * Продавцу — итоговая ставка минус комиссия лота (fee_pct). Деньги и отметка seller_paid —
 * одной транзакцией под замком лота: у энергии нет защиты от повтора по ключу,
 * поэтому «ровно один раз» держит отметка. Комиссия (seller_fee) остаётся у
 * игры; с DARAI/USDT/звёзд её раскладывает по корзинам settle-player.ts (fee_booked).
 */
const PAY_FN = `CREATE OR REPLACE FUNCTION yuplink.auction_pay_seller(p_auction text)
RETURNS numeric
LANGUAGE plpgsql AS $fn$
DECLARE a yuplink.auction%ROWTYPE; v_top numeric; v_pay numeric; v_ref text; v_keep numeric;
BEGIN
  SELECT * INTO a FROM yuplink.auction WHERE id = p_auction FOR UPDATE;
  IF NOT FOUND OR a.source <> 'player' OR a.status <> 'settled' OR a.seller_paid THEN RETURN NULL; END IF;
  SELECT b.amount INTO v_top FROM yuplink.auction_bid b
   WHERE b.auction_id = p_auction AND b.active
   ORDER BY b.amount DESC, b.created_at ASC, b.id ASC LIMIT 1;
  IF v_top IS NULL THEN RETURN NULL; END IF;
  v_keep := 100 - COALESCE(a.fee_pct, ${LEGACY_FEE_PCT});
  IF a.currency = 'energy' OR a.currency LIKE 'res:%' THEN
    v_pay := floor(v_top * v_keep / 100);
  ELSE
    v_pay := round(v_top * v_keep / 100, 8);
  END IF;
  v_ref := 'gauclot:' || p_auction || ':pay';
  IF v_pay > 0 THEN
    IF a.currency = 'energy' THEN
      PERFORM yuplink.energy_add_acc(a.seller_account_id, v_pay, 'energy_refund', v_ref);
    ELSIF a.currency LIKE 'res:%' THEN
      PERFORM * FROM yuplink.res_move(a.seller_account_id, substr(a.currency, 5), v_pay, 'auction_sale', v_ref);
    ELSE
      PERFORM * FROM yuplink.acc_move(a.seller_account_id, a.currency, v_pay, 'acc_refund', v_ref, a.seller_wallet);
    END IF;
  END IF;
  UPDATE yuplink.auction
     SET seller_paid = true, seller_payout = v_pay, seller_fee = v_top - v_pay,
         fee_booked = a.fee_booked OR a.currency NOT IN (${FEE_TOKENS.map((t) => `'${t}'`).join(", ")})
                      OR v_top - v_pay <= 0
   WHERE id = p_auction;
  RETURN v_pay;
END $fn$`;

/** Миграция дома. Каждая строка — отдельный запрос (идемпотентны). */
export const HOUSE_MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS yuplink.castle_auction_house (
     account_id text PRIMARY KEY,
     level integer NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND ${HOUSE_MAX_LEVEL}),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS yuplink.castle_auction_house_op (
     op_id text PRIMARY KEY,
     account_id text NOT NULL,
     detail jsonb NOT NULL DEFAULT '{}'::jsonb,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'game'",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS seller_account_id text",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS seller_wallet text",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS escrow jsonb",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS seller_paid boolean NOT NULL DEFAULT false",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS seller_payout numeric",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS seller_fee numeric",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS fee_booked boolean NOT NULL DEFAULT false",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS item_returned boolean NOT NULL DEFAULT false",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS closed_at timestamptz",
  "ALTER TABLE yuplink.auction ADD COLUMN IF NOT EXISTS fee_pct numeric",
  // Потолок уровня поднят до 10 (14.10): CHECK пересоздаётся под текущий максимум.
  "ALTER TABLE yuplink.castle_auction_house DROP CONSTRAINT IF EXISTS castle_auction_house_level_check",
  `ALTER TABLE yuplink.castle_auction_house ADD CONSTRAINT castle_auction_house_level_check
     CHECK (level BETWEEN 0 AND ${HOUSE_MAX_LEVEL})`,
  `CREATE INDEX IF NOT EXISTS auction_seller_idx ON yuplink.auction (seller_account_id, status)
     WHERE seller_account_id IS NOT NULL`,
  UPGRADE_FN,
  OPEN_FN,
  PAY_FN,
];
