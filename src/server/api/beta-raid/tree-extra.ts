// Дерево уровней в окне постройки: кого прокачаем, чем платить и можно ли.
// Вынесено из building-extra.ts без изменения логики — тот держится в лимите
// ≤250 строк и зовёт treeExtra() отсюда.
import { raidOwner } from "./owner";
import { buildingUsed } from "./building-used";
import { cellTreePrices, type BuildingExtra } from "@/lib/buildingEffect";

/** Дерево уровней: кого прокачаем, чем платить и можно ли вообще. */
export async function treeExtra(opts: {
  built: boolean;
  wallet: string;
  mapId: string;
  q: number;
  r: number;
  meta?: unknown;
  cellConfig?: unknown;
}): Promise<BuildingExtra> {
  const { built, wallet, mapId, q, r } = opts;
  const prices = cellTreePrices(opts.cellConfig, opts.meta);
  const { selectedHeroRow } = await import("./hero-current");
  const { heroMaxLevel } = await import("./tree-levelup");
  const row = await selectedHeroRow(wallet).catch(() => null);
  const hero = row
    ? { id: row.id, name: row.name, level: row.level, maxLevel: heroMaxLevel(row.rarity) }
    : null;

  const owner = await raidOwner(wallet);
  const used = built ? await buildingUsed(owner, mapId, q, r, "leveltree") : false;
  const atMax = !!hero && hero.level >= hero.maxLevel;
  // Причину отдаём ключом словаря: язык игрока знает только клиент.
  const reasonKey = !built
    ? "braid.tree_not_grown"
    : prices.length === 0
      ? "braid.tree_not_set"
      : !hero
        ? "braid.pick_hero_first"
        : atMax
          ? "braid.hero_at_max"
          : used
            ? "braid.tree_used"
            : null;

  return {
    kind: "leveltree",
    prices,
    hero,
    used,
    can: built && prices.length > 0 && !!hero && !atMax && !used,
    reasonKey,
    reasonParams: atMax && hero ? { n: hero.maxLevel } : undefined,
  };
}
