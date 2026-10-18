// Клетки задания поверх сгенерированного острова: сундук с досками, дубы,
// слабые боссы с рудой (у двух — артефакт и тренировочный пак), кристаллы,
// мастерская, лесопилка, разрушенный портал. Клады (закопанные мешочки) и
// лодку пишет сервер отдельно — клетки под кладами здесь только расчищаем.
import { hashCell, keyOf } from "@/lib/raid/zonegen/town/hex";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import type { IslandPlaces } from "@/lib/raid/island/steps";
import {
  ISLAND_ARTIFACT,
  ISLAND_BUILDINGS,
  ISLAND_TRAINING_PACK,
  ISLAND_DECOR,
  ISLAND_HIT_COST,
  ISLAND_ITEMS,
  ISLAND_LOOT,
  ISLAND_MINE_CONFIG,
  ISLAND_OBJECTS,
  WEAK_BOSSES,
  WORKSHOP_TIER,
  type Amount,
} from "@/lib/raid/island/catalog";
import { SHIPYARD_TIER_SMALL } from "@/lib/shipRules";

/** Награда объекта — только свои товары, первому месту (игрок на острове один). */
export const lootConfig = (loot: readonly Amount[]) => ({
  items: [],
  packs: [],
  split: [100],
  fillers: loot.map((a) => ({
    kind: "custom",
    token: null,
    amount: a.n,
    itemId: ISLAND_ITEMS[a.item],
    toPlace: 1,
  })),
});

/** Сеть портала острова: своя комната 1 на карте острова (имя — «Основной мир»). */
export const ISLAND_PORTAL_GROUP = 1;

const portalConfig = () => ({
  portal: {
    group: ISLAND_PORTAL_GROUP,
    prices: [],
    levelFrom: 1,
    levelTo: 100,
    levelFromOn: false,
    levelToOn: false,
    moveEnergyMin: 0,
    moveEnergyMinOn: false,
  },
});

type Patch = Partial<WorldCell>;

const clean: Patch = {
  decorationId: null,
  objectId: null,
  objectConfig: null,
  roadId: null,
  buildingId: null,
  buildingSkinId: null,
  buildingConfig: null,
  tier: null,
};

type At = { q: number; r: number };
const same = (a: At | null, b: At) => !!a && a.q === b.q && a.r === b.r;

/**
 * Простые боссы — без артефакта и пака: им точка возрождения. Призовым — нет:
 * возрождение копирует награду клетки, приз выпадал бы снова.
 */
export const plainBosses = (p: IslandPlaces): At[] =>
  p.monsters.filter((m) => !same(p.artifact, m) && !same(p.pack, m));

/** Вид босса: первый — слизень задания, остальные — слабый от сида и клетки. */
export const bossKind = (i: number, c: At, seed: number) =>
  i === 0 ? WEAK_BOSSES[0] : WEAK_BOSSES[hashCell(seed, c.q, c.r) % WEAK_BOSSES.length];

/** Что ляжет на клетки задания: ключ клетки → правка. */
export function featurePatches(p: IslandPlaces, seed: number): Map<string, Patch> {
  const out = new Map<string, Patch>();
  const put = (c: { q: number; r: number }, patch: Patch) =>
    out.set(keyOf(c), { ...clean, ...patch });
  put(p.spawn, {});
  put(p.treasure, {});
  for (const d of p.digs) put(d, {});
  put(p.chest, {
    objectId: ISLAND_OBJECTS.chest,
    objectConfig: {
      maxHp: 1,
      interactionCost: ISLAND_HIT_COST.chest,
      rewardConfig: lootConfig(ISLAND_LOOT.chest),
    },
  });
  for (const t of p.trees) put(t, { decorationId: ISLAND_DECOR.oak });
  for (const c of p.crystals) put(c, { decorationId: ISLAND_DECOR.crystal });
  p.monsters.forEach((m, i) => {
    const kind = bossKind(i, m, seed);
    // Призы — у двух случайных боссов, не у первого (places).
    const reward = {
      ...lootConfig(i === 0 ? ISLAND_LOOT.slime : ISLAND_LOOT.boss),
      items: same(p.artifact, m) ? [{ itemTemplateId: ISLAND_ARTIFACT, toPlace: 1 }] : [],
      packs: same(p.pack, m) ? [{ packId: ISLAND_TRAINING_PACK, toPlace: 1 }] : [],
    };
    // HP и цена удара — шаблона, как у тех же боссов в мире (владелец,
    // 17.10.2026: «никаких поблажек»); своя у клетки только награда острова.
    put(m, {
      objectId: kind.id,
      objectConfig: {
        rewardConfig: reward,
      },
    });
  });
  put(p.workshop, {
    buildingId: ISLAND_BUILDINGS.workshop,
    tier: WORKSHOP_TIER,
    buildingConfig: { effect: "market" },
  });
  put(p.mine, { buildingId: ISLAND_BUILDINGS.mine, buildingConfig: { ...ISLAND_MINE_CONFIG } });
  put(p.portal, { buildingId: ISLAND_BUILDINGS.portal, tier: 0, buildingConfig: portalConfig() });
  // Верфь готова к спуску обычного корабля (тир 1 — SHIPYARD_TIER_SMALL): корабль
  // игрок строит сам, по цене мира.
  if (p.shipyard)
    put(p.shipyard, { buildingId: ISLAND_BUILDINGS.shipyard, tier: SHIPYARD_TIER_SMALL });
  return out;
}

/** Применить правки к клеткам острова (местность клетки не меняется). */
export function applyFeatures(
  cells: readonly WorldCell[],
  p: IslandPlaces,
  seed: number,
): WorldCell[] {
  const patches = featurePatches(p, seed);
  return cells.map((c) => {
    const patch = patches.get(keyOf(c));
    return patch ? { ...c, ...patch, mode: "built" as const } : c;
  });
}
