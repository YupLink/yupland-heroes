// Ставка и список аукционов для игрока. Ставка — одна SQL-функция
// auction_place_bid (bid-fn.ts): списание, запись, вытеснение и возврат в одной
// транзакции под замком лота. Лотов в аукционе N: держат их N лучших ставок.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { getCurrentWallet } from "../../auth";
import { accAccountId, humanizeAccError } from "../currency/move";
import { ensureAuctionSchema } from "./schema";
import { settleDueAuctions, settleOne } from "./settle";
import { lotState, activeBidsFor } from "./lots";

/** Машинный ответ функции → понятная игроку причина. */
async function bidError(raw: string, auctionId: string): Promise<string> {
  if (/auction_closed/.test(raw)) {
    await settleOne(auctionId).catch(() => {});
    return "Аукцион уже завершён";
  }
  if (/auction_not_found/.test(raw)) return "Аукцион не найден";
  if (/own_lot/.test(raw)) return "На свой лот ставить нельзя";
  if (/whole_only/.test(raw)) return "Ставка — только целым числом";
  const energy = raw.match(/not_enough_energy:([\d.]+):([\d.]+)/);
  if (energy) return `Не хватает энергии: нужно ${Number(energy[2])}, есть ${Number(energy[1])}`;
  if (/res_move: в минус/.test(raw)) return "Не хватает ресурса для ставки";
  const low = raw.match(/bid_too_low:([\d.]+)/);
  if (low) return `Минимальная ставка — ${Number(low[1]).toLocaleString("ru-RU")}`;
  return humanizeAccError(raw);
}

export const placeBid = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        auctionId: z.string().min(1),
        amount: z.number().positive(),
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Сначала войди через Telegram");
    await ensureAuctionSchema();
    await settleDueAuctions().catch(() => {});
    const accountId = await accAccountId(wallet);
    if (!accountId) throw new Error("У кошелька нет аккаунта — войди заново");

    const { data: rows, error } = await sb.rpc("auction_place_bid", {
      p_auction: data.auctionId,
      p_bid_id: `gaucb_${nanoid(10)}`,
      p_account: accountId,
      p_wallet: wallet,
      p_amount: data.amount,
      // Ключ нажатия: повтор того же запроса не спишет второй раз.
      p_charge_ref: `gaucbid:${data.opId}`,
    });
    if (error) throw new Error(await bidError(String(error.message ?? ""), data.auctionId));
    const row = (rows as Array<{ o_result: string; o_end_at: string }> | null)?.[0];
    return { ok: true, duplicate: row?.o_result === "duplicate", endAt: row?.o_end_at ?? null };
  });

type LiveRow = {
  id: string;
  title: string | null;
  prize_kind: string;
  prize_ref: string;
  prize_qty: number;
  currency: string;
  start_price: number;
  min_step_pct: number;
  end_at: string;
  winners: number;
  source: string;
  seller_account_id: string | null;
  top_bid_id: string | null;
  esc_image: string | null;
};

export const listAuctions = createServerFn({ method: "GET" }).handler(async () => {
  await ensureAuctionSchema();
  await settleDueAuctions().catch(() => {});
  const wallet = getCurrentWallet();
  const accountId = wallet ? await accAccountId(wallet).catch(() => null) : null;
  const rows = ((await mcpExec(
    `SELECT id, title, prize_kind, prize_ref, prize_qty, currency, start_price, min_step_pct,
            end_at, winners, source, seller_account_id, top_bid_id, escrow->>'image' AS esc_image
       FROM yuplink.auction WHERE status='live'
      ORDER BY end_at ASC, series_id NULLS FIRST, series_no ASC LIMIT 100;`,
    { wrapJson: true },
  ).catch(() => [])) ?? []) as LiveRow[];
  const active = await activeBidsFor(rows.map((r) => r.id));
  const { resolvePrizeMeta } = await import("./prize-meta");
  const meta = await resolvePrizeMeta(rows).catch(() => new Map());
  const auctions = rows.map((r) => {
    const m = meta.get(r.prize_ref);
    const winners = Number(r.winners) || 1;
    const s = lotState({
      startPrice: Number(r.start_price),
      stepPct: Number(r.min_step_pct),
      winners,
      active: active.get(r.id) ?? [],
      me: accountId,
    });
    return {
      id: r.id,
      // Имя лота = имя самого приза (бокса/героя); title — только ручной override.
      prizeName: m?.name || r.title || r.prize_ref,
      prizeImage: m?.image ?? r.esc_image ?? null,
      prizeInfo: m?.info ?? null,
      prizeKind: r.prize_kind,
      prizeQty: Number(r.prize_qty),
      currency: r.currency,
      current: s.top ?? Number(r.start_price),
      nextMin: s.nextMin,
      amIWinning: s.mine != null,
      endAt: r.end_at,
      fromPlayer: r.source === "player",
      mine: !!accountId && r.seller_account_id === accountId,
      // Свой лот снимается, пока на нём нет ставок.
      canCancel: !!accountId && r.seller_account_id === accountId && !r.top_bid_id,
    };
  });
  return { auctions };
});
