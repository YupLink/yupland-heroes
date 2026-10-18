// Лента одного игрока: все движения по всем леджерам и сделки — одной
// хронологией, страницами по курсору (ISO «at» последней строки). Только владелец.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { mcpExec } from "@/server/db/mcpClient";
import type { FeedReport, FeedRow } from "@/lib/econ/types";
import { normalizeRange, rangeSchema, toIso } from "./range";
import { cacheKey, memo } from "./cache";
import { pageByAt } from "./page-cursor";
import { groupOfKind, type EconLedger } from "./kinds";
import { refPlace } from "./ref-place";
import { displayNames } from "./names";
import { feedSql } from "./feed-sql";
import { tradeNote } from "./trade-note";
import { NOT_PLAYERS } from "./trades-fetch";

type Row = {
  at: string;
  ledger: EconLedger;
  currency: string | null;
  delta: number | string | null;
  kind: string;
  ref: string | null;
  map_id: string | null;
  q: number | string | null;
  r: number | string | null;
  source: string | null;
  side: string | null;
  item_name: string | null;
  qty: number | string | null;
  price_unit: number | string | null;
  counterparty: string | null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v == null ? null : num(v));

const inputSchema = z.object({
  accountId: z.string().min(1).max(128),
  range: rangeSchema,
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(300).default(100),
});

export const adminEconFeed = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<FeedReport> => {
    requireAdmin();
    const range = normalizeRange(data.range);
    const { accountId, limit } = data;
    const cursor = data.cursor ?? null;
    return memo(cacheKey("feed", { accountId, range, cursor, limit }), async () => {
      // Строка сверх лимита — чтобы отличить «ровно лимит» от «есть ещё».
      const rows = (await mcpExec(feedSql(accountId, range, cursor, limit + 1), {
        wrapJson: true,
      })) as Row[];
      const list = rows ?? [];

      // Имена — свой и контрагентов-игроков (рынок фишек), одним запросом.
      const ids = [accountId];
      for (const r of list)
        if (r.counterparty && !NOT_PLAYERS.has(r.counterparty)) ids.push(r.counterparty);
      const names = await displayNames(ids);

      const out: FeedRow[] = list.map((r) => {
        const isTrade = r.ledger === "trade";
        const q = numOrNull(r.q);
        const rr = numOrNull(r.r);
        const place =
          isTrade && r.map_id && q != null && rr != null
            ? { mapId: r.map_id, q, r: rr }
            : refPlace(r.ref);
        const cp = r.counterparty;
        // У полки и платы за ворота/портал денег нет: currency — сам товар.
        const priced = r.side === "buy" || r.side === "sell";
        const note = isTrade
          ? tradeNote({
              source: r.source ?? "",
              side: r.side ?? "",
              itemName: r.item_name ?? "?",
              qty: num(r.qty),
              priceUnit: numOrNull(r.price_unit),
              priceCur: priced ? r.currency : null,
              total: priced ? Math.abs(num(r.delta)) : null,
              q,
              r: rr,
              counterpartyName:
                cp && !NOT_PLAYERS.has(cp) ? (names.get(cp)?.displayName ?? null) : null,
            })
          : null;
        return {
          at: toIso(r.at),
          ledger: r.ledger,
          currency: r.currency ?? "?",
          delta: num(r.delta),
          kind: r.kind,
          group: groupOfKind(r.ledger, r.kind, r.ref),
          ref: r.ref,
          place,
          note,
        };
      });

      const page = pageByAt(out, limit);
      return {
        accountId,
        displayName: names.get(accountId)?.displayName ?? accountId,
        range,
        rows: page.rows,
        nextCursor: page.nextCursor,
      };
    });
  });
