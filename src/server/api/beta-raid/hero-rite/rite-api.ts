// Зачарование героев (владелец, 29.10.2026): ручки окна постройки с эффектом
// hero_enchant. Правила — @/lib/enchant/heroRite; попытка — rite-flow; доступ,
// цена и журнал — общие с лавкой артефактов (enchant/*).
//
// Ключи react-query у клиента: ["hero-rite", mapId, q, r] и
// ["hero-rite-heroes", rarity]; после попытки — они же, герои и балансы.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { isAdminWallet } from "@/server/auth";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { actionGate } from "@/server/rateGate";
import type { HeroRite, HeroRiteResult, HeroRiteView, RiteHero } from "@/lib/enchant/heroRite";
import {
  enchantAccount,
  requireEnchantAdmin,
  requireEnchantShop,
} from "@/server/api/beta-raid/enchant/enchant-access";
import { costViewer, enchantCostOptions } from "@/server/api/beta-raid/enchant/enchant-costs";
import { enchantHave } from "@/server/api/beta-raid/enchant/enchant-have";
import {
  newRiteId,
  normalizeRite,
  riteHeroesInput,
  riteRunInput,
  riteSaveInput,
  riteShopInput,
} from "./rite-input";
import { riteIdsAtSql, saveRitesSql } from "./rite-sql";
import { dbRitePort, loadRites, riteHeroes } from "./rite-port";
import { heroRiteAs } from "./rite-flow";

type Cell = { mapId: string; q: number; r: number };

/** Обряды клетки в вид окна — с запасом игрока по каждой позиции цены. */
async function shopRites(wallet: string, cell: Cell): Promise<HeroRiteView[]> {
  const rites = await loadRites(cell.mapId, cell.q, cell.r);
  if (!rites.length) return [];
  const account = await enchantAccount(wallet).catch(() => null);
  const costs = rites.flatMap((s) => s.cost);
  const have = account ? await enchantHave(wallet, account, costs) : () => 0;
  const view = await costViewer(costs, have);
  return rites.map((s) => ({ ...s, cost: s.cost.map(view) }));
}

export const getHeroRiteShop = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => riteShopInput.parse(d))
  .handler(async ({ data }): Promise<{ rites: HeroRiteView[]; canEdit: boolean }> => {
    const wallet = await requireBetaRaid();
    const canEdit = isAdminWallet(wallet);
    await requireEnchantShop(wallet, data, !canEdit, "hero_enchant");
    return { rites: await shopRites(wallet, data), canEdit };
  });

/** Свои свободные герои редкости — кого можно положить в обряд. */
export const listRiteHeroes = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => riteHeroesInput.parse(d))
  .handler(async ({ data }): Promise<RiteHero[]> => {
    const wallet = await requireBetaRaid();
    return riteHeroes(await enchantAccount(wallet), data.rarity);
  });

export const saveHeroRites = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => riteSaveInput.parse(d))
  .handler(async ({ data }): Promise<{ rites: HeroRiteView[] }> => {
    const wallet = requireEnchantAdmin();
    await requireEnchantShop(wallet, data, false, "hero_enchant");
    const rites = await prepareRites(data, data.rites);
    await mcpExec(saveRitesSql(data.mapId, data.q, data.r, rites));
    return { rites: await shopRites(wallet, data) };
  });

/** Разбор списка админа: по правилам, цена — из справочников, id — свой у клетки или новый. */
export async function prepareRites(cell: Cell, raw: unknown[]): Promise<HeroRite[]> {
  const rites = raw.map(normalizeRite);
  const known = new Set((await enchantCostOptions()).map((o) => `${o.kind}:${o.code}`));
  if (rites.some((s) => s.cost.some((c) => !known.has(`${c.kind}:${c.code}`))))
    throw new Error("enchant.bad_cost");
  const rows = (await mcpExec(riteIdsAtSql(cell.mapId, cell.q, cell.r), {
    wrapJson: true,
  })) as Array<{ id: string }>;
  const own = new Set((rows ?? []).map((r) => r.id));
  const seen = new Set<string>();
  return rites.map((s) => {
    const id = s.id && own.has(s.id) && !seen.has(s.id) ? s.id : newRiteId();
    seen.add(id);
    return { ...s, id };
  });
}

export const runHeroRite = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => riteRunInput.parse(d))
  .handler(async ({ data }): Promise<HeroRiteResult> => {
    const wallet = await requireBetaRaid();
    await actionGate("enchant", wallet);
    await requireEnchantShop(wallet, data, true, "hero_enchant");
    const account = await enchantAccount(wallet);
    return heroRiteAs(await dbRitePort(wallet, account, data.opId, data), wallet, account, data);
  });
