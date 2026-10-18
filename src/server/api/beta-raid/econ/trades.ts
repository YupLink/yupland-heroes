// Отчёт «сделки»: строки журнала с фильтрами (игрок, товар, источник, клетка)
// и цепочки «купил → продал» по всему окну (с теми же фильтрами). Только владелец.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import type { TradesReport } from "@/lib/econ/types";
import { normalizeRange, rangeSchema } from "./range";
import { cacheKey, memo } from "./cache";
import { fetchTrades } from "./trades-fetch";
import { buildChains } from "./chains";
import { pageByAt } from "./page-cursor";

const SOURCES = [
  "market",
  "market_sell",
  "town",
  "chip_market",
  "wh_take",
  "wh_put",
  "gate",
  "portal",
  "tour",
  "field",
  "chest",
  "chest_plunder",
  "loot_bag",
  "plain_chest",
  "mystic",
  "fish",
  "drink",
] as const;

/**
 * Потолок строк на цепочки: они считаются по ВСЕМУ окну, а не по странице —
 * иначе «купил в понедельник, продал в пятницу» на страницу по 100 строк не
 * попадает. Тот же предел, что у лазеек: тысячи сделок за окно, не миллионы.
 */
const CHAINS_CAP = 20_000;

const inputSchema = z.object({
  range: rangeSchema,
  accountId: z.string().min(1).max(128).optional(),
  itemKey: z.string().min(1).max(200).optional(),
  source: z.enum(SOURCES).optional(),
  cell: z.object({ mapId: z.string().min(1), q: z.number().int(), r: z.number().int() }).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const adminEconTrades = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<TradesReport> => {
    requireAdmin();
    const range = normalizeRange(data.range);
    const { accountId, itemKey, source, cell, limit } = data;
    const cursor = data.cursor ?? null;
    const key = cacheKey("trades", { range, accountId, itemKey, source, cell, cursor, limit });
    return memo(key, async () => {
      // Берём на строку больше лимита: так узнаём, есть ли следующая страница,
      // не считая count(*) по журналу; границу по «at» режет pageByAt.
      const filter = { accountId, itemKey, source, cell };
      const [fetched, forChains] = await Promise.all([
        fetchTrades(range, { ...filter, cursor }, limit + 1),
        // Цепочки — только с первой страницей: «Ещё» листает строки, а
        // цепочки у клиента уже на руках (пересчитывать их на каждую страницу
        // — лишний проход по всему окну).
        cursor
          ? Promise.resolve([])
          : fetchTrades(range, { ...filter, sides: ["buy", "sell"] }, CHAINS_CAP),
      ]);
      const { rows, nextCursor } = pageByAt(fetched, limit);
      return { range, rows, chains: buildChains(forChains), nextCursor };
    });
  });
