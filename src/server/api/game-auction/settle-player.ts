// Закрытие лота игрока (аукционный дом). Приз победителю выдаёт общий
// deliverWinners (settle.ts); здесь — то, чего у лотов игры нет:
//   продан   → продавцу ставка минус комиссия лота (SQL auction_pay_seller,
//              ровно один раз), комиссия с DARAI/USDT/звёзд — по корзинам, как
//              оплата подписки (moneyCtes);
//   не продан, снят, не вышел в торги → вещь из залога назад (escrow.ts).
// Всё идемпотентно: сбой оставит отметку незакрытой, обход settleDueAuctions
// повторит.
import { mcpExec } from "../../db/mcpClient";
import { sb } from "../../db/pg";
import { sqlStr } from "../raid-shared";
import { moneyCtes } from "../energy-sub/money-sql";
import { returnEscrow, type EscrowLot } from "./escrow";
import { FEE_TOKENS } from "./house-fn";

type PlayerLot = EscrowLot & {
  source: string;
  status: string;
  currency: string;
  winner_account_id: string | null;
  seller_paid: boolean;
  seller_fee: number | string | null;
  fee_booked: boolean;
  item_returned: boolean;
};

type FeeToken = (typeof FEE_TOKENS)[number];

async function loadLot(id: string): Promise<PlayerLot | null> {
  const rows = (await mcpExec(
    `SELECT id, title, source, status, prize_kind, prize_ref, prize_qty, currency,
            winner_account_id, seller_account_id, seller_wallet, escrow, seller_paid,
            seller_fee, fee_booked, item_returned
       FROM yuplink.auction WHERE id = ${sqlStr(id)};`,
    { wrapJson: true },
  )) as PlayerLot[];
  return rows?.[0] ?? null;
}

/** Комиссия DARAI/USDT/звёзд — в пул карты и корзины подписки; отметка и деньги одним запросом. */
async function bookFee(lot: PlayerLot): Promise<void> {
  const fee = Number(lot.seller_fee) || 0;
  const id = sqlStr(lot.id);
  if (!(fee > 0) || !FEE_TOKENS.includes(lot.currency as FeeToken)) {
    await mcpExec(`UPDATE yuplink.auction SET fee_booked = true WHERE id = ${id};`, {
      wrapJson: false,
    });
    return;
  }
  const money = moneyCtes({
    after: "f",
    id: lot.id,
    prefix: "gauc",
    note: "комиссия аукциона",
    token: lot.currency as FeeToken,
    amount: fee,
  });
  await mcpExec(`
WITH f AS (
  UPDATE yuplink.auction SET fee_booked = true
   WHERE id = ${id} AND seller_paid AND NOT fee_booked
  RETURNING id
)${money}
SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT count(*) FROM f)::int AS booked) _t;`);
  // Корзины — пачкой, если набрали порог: как после покупки подписки.
  void import("../energy-sub/batch")
    .then((m) => m.runDueBatches("auto"))
    .catch((e) => console.warn("[auction] пачки:", e instanceof Error ? e.message : e));
}

/** Довести лот игрока: выплата и комиссия либо возврат залога. */
export async function settlePlayerLot(auctionId: string): Promise<void> {
  let lot = await loadLot(auctionId);
  if (!lot || lot.source !== "player") return;

  if (lot.status === "settled" && lot.winner_account_id) {
    if (!lot.seller_paid) {
      const { error } = await sb.rpc("auction_pay_seller", { p_auction: lot.id });
      if (error) {
        console.warn(`[auction] выплата продавцу ${lot.id} не прошла, повторим:`, error.message);
        return;
      }
      lot = await loadLot(auctionId);
      if (!lot) return;
    }
    if (lot.seller_paid && !lot.fee_booked) await bookFee(lot);
    return;
  }

  const dead =
    lot.status === "cancelled" ||
    lot.status === "void" ||
    (lot.status === "settled" && !lot.winner_account_id);
  if (!dead || lot.item_returned) return;
  await returnEscrow(lot);
  await mcpExec(`UPDATE yuplink.auction SET item_returned = true WHERE id = ${sqlStr(lot.id)};`, {
    wrapJson: false,
  });
}

/** Бронь, застрявшая в 'escrow' (обрыв посреди выставления), — в 'void' и вещь назад. */
export async function voidStaleEscrow(auctionId: string): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.auction SET status = 'void', closed_at = now()
      WHERE id = ${sqlStr(auctionId)} AND status = 'escrow'
        AND created_at < now() - interval '10 minutes';`,
    { wrapJson: false },
  );
  await settlePlayerLot(auctionId);
}

/** Условие обхода: у лота игрока осталась недоведённая работа. */
export const PLAYER_DUE_SQL = `(a.source = 'player' AND (
     (a.status = 'settled' AND a.winner_account_id IS NOT NULL AND (NOT a.seller_paid OR NOT a.fee_booked))
  OR (NOT a.item_returned AND (a.status IN ('cancelled', 'void')
        OR (a.status = 'settled' AND a.winner_account_id IS NULL)))
  OR (a.status = 'escrow' AND a.created_at < now() - interval '10 minutes')))`;
