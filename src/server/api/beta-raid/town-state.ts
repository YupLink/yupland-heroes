// Состояние города: голодает ли он и когда голод снимается.
//
// Голод (владелец, 03.10.2026): жителям в сутки не хватило хоть чего-то из еды —
// лавки, привязанные к ратуше, ничего не продают и только ПРИНИМАЮТ еду — так
// игроки и спасают город. Как только каждой еды набралось на сутки, лавки
// снова торгуют. Прочие постройки голод не трогает (зоны города нет с 04.10).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { dailyNeed, isUpkeep, safeParseTownConfig, type TownConfig } from "@/lib/townConfig";
import type { TownKey } from "./town-stock";

/** Ключ ошибки «город голодает»: humanError переведёт на язык игрока. */
export const TOWN_STARVING_KEY = "town.starving";

export type TownRead = { cfg: TownConfig; starvingSince: string | null };

/** Настройки ратуши и отметка голода. null — ратуши в реестре нет; сбой базы — бросок. */
export async function readTown(town: TownKey): Promise<TownRead | null> {
  const rows = (await mcpExec(
    `SELECT config, starving_since FROM yuplink.raid_town
      WHERE map_id = ${sqlStr(town.mapId)} AND q = ${town.q} AND r = ${town.r} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ config: unknown; starving_since: string | null }>;
  const row = rows?.[0];
  if (!row) return null;
  return { cfg: safeParseTownConfig(row.config), starvingSince: row.starving_since ?? null };
}

/** Поставить или снять голод. Ставим один раз — время начала не сдвигается. */
export async function setStarving(town: TownKey, on: boolean): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.raid_town
        SET starving_since = ${on ? "COALESCE(starving_since, now())" : "NULL"}
      WHERE map_id = ${sqlStr(town.mapId)} AND q = ${town.q} AND r = ${town.r};`,
    { wrapJson: false },
  );
}

/**
 * Наелся ли город: запас КАЖДОЙ еды не меньше суточной нормы — жители в
 * безопасности на сегодня (владелец, 03.10.2026: «снятие голода — 100% нормы
 * суточной, не полсклада»). Еды нет вовсе — голодать нечему.
 */
export function townFed(cfg: TownConfig, stock: Record<string, number>): boolean {
  return cfg.goods
    .filter(isUpkeep)
    .every((g) => (stock[g.id] ?? 0) + 1e-9 >= dailyNeed(g, cfg.residents));
}

/**
 * Решение суточного тика: не хватило хоть чего-то — голод сразу; голодал и
 * сегодня наелся до порога — голод снят; иначе как было.
 */
export function decideStarving(opts: {
  short: boolean;
  wasStarving: boolean;
  fed: boolean;
}): boolean {
  if (opts.short) return true;
  if (opts.wasStarving) return !opts.fed;
  return false;
}
