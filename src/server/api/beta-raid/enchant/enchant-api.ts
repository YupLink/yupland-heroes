// Лавка зачарования (владелец, 28.10.2026): ручки окна постройки с эффектом
// enchant. Правила чисел — @/lib/enchant/enchant; попытка — enchant-flow;
// доступ — enchant-access; цена — механизмом маркета (enchant-pay).
//
// Ключи react-query у клиента: ["enchant-shop", mapId, q, r] и
// ["enchant-artifacts"]; после попытки — они же, герой, my-game-items, балансы.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { isAdminWallet } from "@/server/auth";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { actionGate } from "@/server/rateGate";
import type {
  EnchantArtifactView,
  EnchantCostOption,
  EnchantSpellView,
} from "@/lib/enchant/enchant";
import { enchantStatRecord, enchantStatsOf } from "@/lib/enchant/enchantGear";
import { enchantAccount, requireEnchantAdmin, requireEnchantShop } from "./enchant-access";
import { enchantCostOptions, spellViews, unknownCosts } from "./enchant-costs";
import { enchantHave } from "./enchant-have";
import { enchantInput, newSpellId, normalizeSpell, saveInput, shopInput } from "./enchant-input";
import { saveSpellsSql, spellIdsAtSql } from "./enchant-sql";
import { dbFlowPort, loadArtifacts, loadSpells } from "./enchant-port";
import { enchantAs, type EnchantResult } from "./enchant-flow";
import type { EnchantSpell } from "@/lib/enchant/enchant";

type Cell = { mapId: string; q: number; r: number };

/** Заклинания клетки в вид окна — с запасом игрока по каждой позиции. */
async function shopSpells(wallet: string, cell: Cell): Promise<EnchantSpellView[]> {
  const spells = await loadSpells(cell.mapId, cell.q, cell.r);
  if (!spells.length) return [];
  const account = await enchantAccount(wallet).catch(() => null);
  const costs = spells.flatMap((s) => [...s.cost, s.fx.cost]);
  const have = account ? await enchantHave(wallet, account, costs) : () => 0;
  return spellViews(spells, have);
}

export const getEnchantShop = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => shopInput.parse(d))
  .handler(async ({ data }): Promise<{ spells: EnchantSpellView[]; canEdit: boolean }> => {
    const wallet = await requireBetaRaid();
    const canEdit = isAdminWallet(wallet);
    await requireEnchantShop(wallet, data, !canEdit);
    return { spells: await shopSpells(wallet, data), canEdit };
  });

/** Все артефакты аккаунта, в т.ч. надетые; статы — уже с зачарованием. */
export const listEnchantArtifacts = createServerFn({ method: "GET" }).handler(
  async (): Promise<EnchantArtifactView[]> => {
    const wallet = await requireBetaRaid();
    const account = await enchantAccount(wallet);
    const rows = await loadArtifacts(account);
    return rows.map((a) => ({
      itemId: a.itemId,
      name: a.name ?? "",
      image: a.image,
      rarity: a.rarity,
      stats: enchantStatRecord(enchantStatsOf(a, a.enchantPct)),
      enchant: a.enchantPct == null ? null : { pct: a.enchantPct, spellName: a.spellName ?? "" },
      equipped: a.equipped,
    }));
  },
);

export const listEnchantCostOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<EnchantCostOption[]> => {
    requireEnchantAdmin();
    return enchantCostOptions();
  },
);

export const saveEnchantSpells = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => saveInput.parse(d))
  .handler(async ({ data }): Promise<{ spells: EnchantSpellView[] }> => {
    const wallet = requireEnchantAdmin();
    await requireEnchantShop(wallet, data, false);
    const spells = await prepareSpells(data, data.spells);
    await mcpExec(saveSpellsSql(data.mapId, data.q, data.r, spells));
    return { spells: await shopSpells(wallet, data) };
  });

/**
 * Разбор списка админа: каждое заклинание по правилам (ключ первой ошибки),
 * позиции цены — только из справочников, id — свой у клетки или новый.
 */
export async function prepareSpells(cell: Cell, raw: unknown[]): Promise<EnchantSpell[]> {
  const spells = raw.map(normalizeSpell);
  const bad = unknownCosts(spells, await enchantCostOptions());
  if (bad.length) throw new Error("enchant.bad_cost");
  const rows = (await mcpExec(spellIdsAtSql(cell.mapId, cell.q, cell.r), {
    wrapJson: true,
  })) as Array<{ id: string }>;
  const own = new Set((rows ?? []).map((r) => r.id));
  const seen = new Set<string>();
  return spells.map((s) => {
    const id = s.id && own.has(s.id) && !seen.has(s.id) ? s.id : newSpellId();
    seen.add(id);
    return { ...s, id };
  });
}

export const enchantArtifact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => enchantInput.parse(d))
  .handler(async ({ data }): Promise<EnchantResult> => {
    const wallet = await requireBetaRaid();
    await actionGate("enchant", wallet);
    await requireEnchantShop(wallet, data, true);
    const account = await enchantAccount(wallet);
    const res = await enchantAs(
      await dbFlowPort(wallet, account, data.opId),
      wallet,
      account,
      data,
    );
    // Статы надетого поменялись (или он пропал) — кэш силы героя сбросить.
    if (res.outcome !== "none") {
      const { invalidateHeroPower } = await import("@/server/api/beta-raid/hero-power");
      invalidateHeroPower(wallet);
    }
    return res;
  });
