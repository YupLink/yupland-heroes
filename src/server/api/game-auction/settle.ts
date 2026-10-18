// Завершение аукционов: по дедлайну закрыть, каждому из N победителей (ставки,
// занимающие лоты) выдать приз подарком, остальным — вернуть деньги. Всё
// идемпотентно и с ретраем: зовётся и кроном, и лениво при чтении списка.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { ensureAuctionSchema } from "./schema";
import { sb } from "../../db/pg";
import { createGift } from "../gifts-create";
import type { GiftKind } from "../gifts-deliver";
import { PLAYER_DUE_SQL, settlePlayerLot, voidStaleEscrow } from "./settle-player";
import { GAME_DUE_SQL, bookGameIncome } from "./settle-game";

type Auc = {
  id: string;
  title: string | null;
  prize_kind: string;
  prize_ref: string;
  prize_qty: number;
  currency: string;
  status: string;
  source: string;
};

// Приз кладём ПОДАРКОМ — победитель забирает клеймом в «Подарках», как добычу.
const PRIZE_TO_GIFT: Record<string, GiftKind> = {
  box: "pack",
  pack: "pack",
  hero: "hero",
  artifact: "art",
  resource: "resource",
  // Товар игрока (аукционный дом) — в рюкзак выбранного героя при клейме.
  custom: "custom",
};

/**
 * Вернуть деньги ставкам, которые не держат лот. Каждая — SQL-функцией
 * auction_refund_bid: деньги (токен/ресурс/энергия) и отметка refunded в одной
 * транзакции — ровно один раз. Сбой — ставка останется, обход повторит.
 */
export async function refundLosers(auctionId: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT id FROM yuplink.auction_bid
      WHERE auction_id=${sqlStr(auctionId)} AND NOT active AND NOT refunded;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string }>;
  let done = 0;
  for (const b of rows ?? []) {
    const { error } = await sb.rpc("auction_refund_bid", { p_bid: b.id });
    if (error) console.warn(`[auction] возврат ${b.id} не прошёл, повторим:`, error.message);
    else done++;
  }
  return done;
}

/** Каждому победителю — свой подарок (ключ на ставку: повтор не задвоит). */
async function deliverWinners(a: Auc): Promise<void> {
  const kind = PRIZE_TO_GIFT[a.prize_kind];
  const winners = (await mcpExec(
    `SELECT id, account_id FROM yuplink.auction_bid
      WHERE auction_id=${sqlStr(a.id)} AND active AND NOT delivered;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string; account_id: string }>;
  for (const w of winners ?? []) {
    if (!kind) break;
    try {
      await createGift(
        {
          accountId: w.account_id,
          kind,
          amount: Math.max(1, Number(a.prize_qty) || 1),
          refId: a.prize_ref,
          title: a.title,
          sourceRef: `gaucwin:${a.id}:${w.id}`,
          createdBy: "auction",
          // Приз оплачен ставкой — не сгорает, как и купленный набор.
          expiresNever: true,
        },
        { notify: true },
      );
      await mcpExec(`UPDATE yuplink.auction_bid SET delivered=true WHERE id=${sqlStr(w.id)};`, {
        wrapJson: false,
      });
    } catch (e) {
      console.warn(`[auction] приз по ставке ${w.id} не выдан, повторим:`, e);
    }
  }
  await mcpExec(
    `UPDATE yuplink.auction SET prize_delivered = NOT EXISTS (
       SELECT 1 FROM yuplink.auction_bid b WHERE b.auction_id=${sqlStr(a.id)} AND b.active AND NOT b.delivered)
      WHERE id=${sqlStr(a.id)};`,
    { wrapJson: false },
  ).catch(() => {});
}

/** Закрыть один аукцион (если пора) и довести выдачу/возвраты. Идемпотентно. */
export async function settleOne(auctionId: string): Promise<void> {
  const a = sqlStr(auctionId);
  // Статус меняется под замком строки: ставка, начатая раньше, успеет до закрытия,
  // а после — функция ставки увидит «закрыт» и откажет.
  await mcpExec(
    `UPDATE yuplink.auction SET status='settled', winner_account_id=top_account_id, closed_at=now()
      WHERE id=${a} AND status='live' AND end_at<=now();`,
    { wrapJson: false },
  ).catch(() => {});
  const auc = (
    (await mcpExec(
      `SELECT id, title, prize_kind, prize_ref, prize_qty, currency, status, source
       FROM yuplink.auction WHERE id=${a};`,
      { wrapJson: true },
    ).catch(() => [])) as Auc[]
  )?.[0];
  if (!auc || auc.status === "live") return;
  if (auc.status === "escrow") return voidStaleEscrow(auc.id);
  await refundLosers(auc.id);
  if (auc.status === "settled") await deliverWinners(auc);
  if (auc.source === "player") await settlePlayerLot(auc.id);
  else if (auc.status === "settled") await bookGameIncome(auc.id, auc.currency);
}

let lastSweep = 0;
/** Закрыть просроченные, дотолкать недоставленные призы и недовозвраты. Троттл 10 с. */
export async function settleDueAuctions(force = false): Promise<void> {
  await ensureAuctionSchema();
  const now = Date.now();
  if (!force && now - lastSweep < 10_000) return;
  lastSweep = now;
  const due = (await mcpExec(
    `SELECT a.id FROM yuplink.auction a
      WHERE (a.status='live' AND a.end_at<=now())
         OR (a.status='settled' AND EXISTS (SELECT 1 FROM yuplink.auction_bid b
               WHERE b.auction_id=a.id AND b.active AND NOT b.delivered))
         OR (a.status<>'live' AND EXISTS (SELECT 1 FROM yuplink.auction_bid b
               WHERE b.auction_id=a.id AND NOT b.active AND NOT b.refunded))
         OR ${PLAYER_DUE_SQL}
         OR ${GAME_DUE_SQL}
      LIMIT 50;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string }>;
  for (const d of due ?? []) await settleOne(d.id).catch(() => {});
}
