// Прошедшие аукционы для свёрнутого списка «Прошедшие» (владелец, 14.10.2026):
// закрытые и отменённые за последние 7 дней, свежие сверху. Грузится, только
// когда список раскрыли. Итог: продан (за сколько), не продан, отменён; для
// зрителя — «твой выигрыш» / «твой лот».
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { getCurrentWallet } from "../../auth";
import { accAccountId } from "../currency/move";
import { ensureAuctionSchema } from "./schema";

const PAST_DAYS = 7;
const PAST_LIMIT = 30;

type PastRow = {
  id: string;
  title: string | null;
  prize_kind: string;
  prize_ref: string;
  prize_qty: number;
  currency: string;
  status: string;
  top_bid: number | null;
  winner_account_id: string | null;
  seller_account_id: string | null;
  ended_at: string;
  esc_image: string | null;
};

export const listPastAuctions = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ source: z.enum(["game", "player"]) }).parse(d))
  .handler(async ({ data }) => {
    await ensureAuctionSchema();
    const wallet = getCurrentWallet();
    const me = wallet ? await accAccountId(wallet).catch(() => null) : null;
    const rows = ((await mcpExec(
      `SELECT id, title, prize_kind, prize_ref, prize_qty, currency, status, top_bid,
              winner_account_id, seller_account_id, COALESCE(closed_at, end_at) AS ended_at,
              escrow->>'image' AS esc_image
         FROM yuplink.auction
        WHERE source = '${data.source}' AND status IN ('settled', 'cancelled')
          AND COALESCE(closed_at, end_at) > now() - interval '${PAST_DAYS} days'
        ORDER BY COALESCE(closed_at, end_at) DESC LIMIT ${PAST_LIMIT};`,
      { wrapJson: true },
    ).catch(() => [])) ?? []) as PastRow[];
    const { resolvePrizeMeta } = await import("./prize-meta");
    const meta = await resolvePrizeMeta(rows).catch(() => new Map());
    return {
      auctions: rows.map((r) => {
        const m = meta.get(r.prize_ref);
        const sold = r.status === "settled" && !!r.winner_account_id;
        return {
          id: r.id,
          prizeName: m?.name || r.title || r.prize_ref,
          prizeImage: m?.image ?? r.esc_image ?? null,
          prizeInfo: m?.info ?? null,
          prizeKind: r.prize_kind,
          prizeQty: Number(r.prize_qty),
          currency: r.currency,
          outcome: (r.status === "cancelled" ? "cancelled" : sold ? "sold" : "unsold") as
            | "sold"
            | "unsold"
            | "cancelled",
          price: sold && r.top_bid != null ? Number(r.top_bid) : null,
          iWon: sold && !!me && r.winner_account_id === me,
          mine: !!me && r.seller_account_id === me,
          endedAt: r.ended_at,
        };
      }),
    };
  });
