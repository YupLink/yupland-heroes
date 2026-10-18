// Отчёт «ресурс»: движение одной валюты по дням, откуда приходит и куда
// уходит, кто больше всех набрал и слил, сколько сейчас на руках. Только владелец.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { mcpExec } from "@/server/db/mcpClient";
import type { KindAmount, ResourceDay, ResourceReport } from "@/lib/econ/types";
import { normalizeRange, rangeSchema } from "./range";
import { cacheKey, memo } from "./cache";
import { groupOfKind, type EconLedger } from "./kinds";
import { kindLabel } from "./deltas-sql";
import { buildDeltaRows } from "./deltas-build";
import { resourceDaysSql, supplyNowSql } from "./resource-sql";

const TOP_N = 15;

type DayRow = {
  day: string;
  ledger: EconLedger;
  kind: string;
  prefix: string;
  plus: number | string;
  minus: number | string;
  n: number | string;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const inputSchema = z.object({ range: rangeSchema, currency: z.string().min(1).max(64) });

export const adminEconResource = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<ResourceReport> => {
    requireAdmin();
    const range = normalizeRange(data.range);
    const { currency } = data;
    return memo(cacheKey("resource", { range, currency }), async () => {
      const [dayRows, deltas, supply] = await Promise.all([
        mcpExec(resourceDaysSql(range, currency), { wrapJson: true }) as Promise<DayRow[]>,
        buildDeltaRows(range, currency),
        (
          mcpExec(supplyNowSql(currency), { wrapJson: true }) as Promise<Array<{ v: unknown }>>
        ).catch(() => [] as Array<{ v: unknown }>),
      ]);

      const days = new Map<string, ResourceDay>();
      const sources = new Map<string, KindAmount>();
      const sinks = new Map<string, KindAmount>();
      for (const r of dayRows ?? []) {
        const label = kindLabel(r.ledger, r.kind, r.prefix);
        const plus = num(r.plus);
        const minus = num(r.minus);
        const day = days.get(r.day) ?? { day: r.day, plus: 0, minus: 0, byKind: {} };
        day.plus += plus;
        day.minus += -minus;
        day.byKind[label] = (day.byKind[label] ?? 0) + plus + minus;
        days.set(r.day, day);

        // Один kind может быть и приходом, и расходом (возвраты): раскладываем
        // по знаку, чтобы «откуда» и «куда» не гасили друг друга.
        const group = groupOfKind(r.ledger, r.kind, r.prefix ? `${r.prefix}:` : null);
        const add = (m: Map<string, KindAmount>, amount: number) => {
          if (!amount) return;
          const k = m.get(label) ?? { kind: label, group, amount: 0, n: 0 };
          k.amount += amount;
          k.n += num(r.n);
          m.set(label, k);
        };
        add(sources, plus);
        add(sinks, minus);
      }

      const byAbs = (a: KindAmount, b: KindAmount) => Math.abs(b.amount) - Math.abs(a.amount);
      const supplyRaw = (supply ?? [])[0]?.v;
      return {
        range,
        currency,
        days: [...days.values()],
        sources: [...sources.values()].sort(byAbs),
        sinks: [...sinks.values()].sort(byAbs),
        topPlus: deltas
          .filter((d) => d.net > 0)
          .sort((a, b) => b.net - a.net)
          .slice(0, TOP_N),
        topMinus: deltas
          .filter((d) => d.net < 0)
          .sort((a, b) => a.net - b.net)
          .slice(0, TOP_N),
        supplyNow: supplyRaw == null ? null : num(supplyRaw),
      };
    });
  });
