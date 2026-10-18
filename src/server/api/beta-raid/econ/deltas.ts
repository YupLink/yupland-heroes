// Отчёт «дельты»: кто сколько заработал/потратил по каждой валюте за окно,
// с разрезом по видам движений и наваром по журналу сделок. Только владелец.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import type { DeltaReport } from "@/lib/econ/types";
import { normalizeRange, rangeSchema } from "./range";
import { cacheKey, memo } from "./cache";
import { buildDeltaRows } from "./deltas-build";

const inputSchema = z.object({
  range: rangeSchema,
  currency: z.string().min(1).max(64).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const adminEconDeltas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<DeltaReport> => {
    requireAdmin();
    const range = normalizeRange(data.range);
    const { currency, limit } = data;
    return memo(cacheKey("deltas", { range, currency, limit }), async () => {
      const rows = await buildDeltaRows(range, currency);
      const currencies = [...new Set(rows.map((r) => r.currency))].sort();
      return { range, currencies, rows: rows.slice(0, limit), truncated: rows.length > limit };
    });
  });
