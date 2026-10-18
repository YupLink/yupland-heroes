// Отчёт «лазейки»: четыре эвристики над журналом сделок, леджерами и
// цепочками; строки отсортированы по score. Только владелец.
//
// Всё лучшее-из-возможного: журнал сделок пишется с выката 22.09 — на старом
// окне арбитраж и полки пусты, а энергия и награды считаются по леджерам,
// которые ведутся давно.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { mcpExec } from "@/server/db/mcpClient";
import type { LoopholesReport } from "@/lib/econ/types";
import { normalizeRange, rangeSchema } from "./range";
import { cacheKey, memo } from "./cache";
import { displayNames } from "./names";
import { fetchTrades } from "./trades-fetch";
import { buildChains } from "./chains";
import { buildDeltaRows } from "./deltas-build";
import { energyOutlierSql, shelfTakerSql, type EnergyRow, type ShelfRow } from "./loopholes-sql";
import {
  ENERGY_MIN_GIFTED,
  findArbitrage,
  findEnergyOutliers,
  findRewardHeavy,
  findShelfTakers,
} from "./loopholes-rules";

/** Потолок строк журнала на арбитраж: окно в 92 дня на живом сервере — тысячи сделок, не миллионы. */
const TRADES_CAP = 20_000;

const inputSchema = z.object({ range: rangeSchema });

export const adminEconLoopholes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<LoopholesReport> => {
    requireAdmin();
    const range = normalizeRange(data.range);
    return memo(cacheKey("loopholes", { range }), async () => {
      const [trades, shelf, energy, deltas] = await Promise.all([
        fetchTrades(range, { sides: ["buy", "sell"] }, TRADES_CAP),
        (mcpExec(shelfTakerSql(range), { wrapJson: true }) as Promise<ShelfRow[]>).catch(
          () => [] as ShelfRow[],
        ),
        (
          mcpExec(energyOutlierSql(range, ENERGY_MIN_GIFTED), { wrapJson: true }) as Promise<
            EnergyRow[]
          >
        ).catch(() => [] as EnergyRow[]),
        // Только счёт и ресурсы: билеты/лайки/энергия под «одни награды» не подходят.
        buildDeltaRows(range, undefined, ["acc", "res"]),
      ]);

      const rows = [
        ...findArbitrage(buildChains(trades)),
        ...findShelfTakers(shelf ?? []),
        ...findEnergyOutliers(energy ?? []),
        ...findRewardHeavy(deltas),
      ];
      // Имена есть у арбитража и наград (пришли с данными); полкам и энергии — дозапросом.
      const names = await displayNames(rows.filter((r) => !r.displayName).map((r) => r.accountId));
      for (const r of rows)
        if (!r.displayName) r.displayName = names.get(r.accountId)?.displayName ?? r.accountId;
      return { range, rows: rows.sort((a, b) => b.score - a.score) };
    });
  });
