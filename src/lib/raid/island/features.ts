// Клетки задания поверх сгенерированного острова: первый сундук (доски и
// подарок острова), дубы, камни, слабые боссы с рудой (прочий дроп бросает
// сервер, island-drops), мастерская, четыре сломанные шахты, разрушенный портал. Клады
// (закопанные мешочки) пишет сервер отдельно; клетки под кладами здесь
// расчищаем, кроме кладов под дубами и камнями — их откапывают после рубки.
import { hashCell, keyOf } from "@/lib/raid/zonegen/town/hex";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import type { IslandPlaces } from "@/lib/raid/island/steps";
import {
  ISLAND_BUILDINGS,
  ISLAND_TRAINING_PACK,
  ISLAND_DECOR,
  ISLAND_HIT_COST,
  ISLAND_ITEMS,
  ISLAND_EXTRA_MINES,
  ISLAND_LOOT,
  ISLAND_MINES,
  ISLAND_OBJECTS,
  WEAK_BOSSES,
  WORKSHOP_TIER,
  islandMineConfig,
  type Amount,
  type IslandMineRes,
} from "@/lib/raid/island/catalog";
import { SHORT_SHIP_LIKES } from "./shortTutorial";
import type { ShortSpellPillar } from "./shortSpell";
import { SHIPYARD_TIER_SMALL } from "@/lib/shipRules";
import { ISLAND_CHEST_GIFT } from "@/lib/raid/island/loot";

/**
 * Первый сундук: доски и — раз на аккаунт — подарок острова (владелец, 20.10:
 * «всё, что дарится, должно лежать в первом сундуке»): лайки, золото, энергия
 * и тренировочные паки. Энергия из «Добычи» — energy_reward, не тает.
 */
export function chestReward(gift: boolean, short = false, pillar?: ShortSpellPillar) {
  const base = lootConfig(short ? [...ISLAND_LOOT.chest, { item: "goldIngot", n: 1 }] : ISLAND_LOOT.chest);
  if (!gift) return base;
  const g = short ? { ...ISLAND_CHEST_GIFT, gold: 0, likes: SHORT_SHIP_LIKES, packs: 0 } : ISLAND_CHEST_GIFT;
  return {
    ...base,
    fillers: [
      ...base.fillers,
      { kind: "likes", token: null, amount: g.likes, toPlace: 1 },
      ...(g.gold > 0 ? [{ kind: "resource", token: null, amount: g.gold, resource: "gold", toPlace: 1 }] : []),
      { kind: "energy", token: null, amount: g.energy, toPlace: 1 },
      // The existing pillar price is funded once, in addition to the boat budget.
      ...(short && pillar ? pillar.spellbook.learnPrices.map((p) => ({
        kind: p.resource === "likes" || p.resource === "energy" ? p.resource : "resource",
        token: null, amount: p.amount, resource: p.resource, toPlace: 1,
      })) : []),
    ],
    packs: Array.from({ length: g.packs }, () => ({ packId: ISLAND_TRAINING_PACK, toPlace: 1 })),
  };
}

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

/** Проход в мир — герою от 5 уровня (Архан через владельца, 19.10). */
export const ISLAND_PORTAL_MIN_LEVEL = 5;

const portalConfig = () => ({
  portal: {
    group: ISLAND_PORTAL_GROUP,
    prices: [],
    levelFrom: ISLAND_PORTAL_MIN_LEVEL,
    levelTo: 100,
    levelFromOn: true,
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
 * Простые боссы — без закреплённого приза: им точка возрождения. Призы у
 * боссов были до 20.10 (артефакт и пак у двух); у новых островов призов нет —
 * встают все.
 */
export const plainBosses = (p: IslandPlaces): At[] =>
  p.monsters.filter((m) => !same(p.artifact, m) && !same(p.pack, m));

/** Вид босса: первый — слизень задания, остальные — слабый от сида и клетки. */
export const bossKind = (i: number, c: At, seed: number) =>
  i === 0 ? WEAK_BOSSES[0] : WEAK_BOSSES[hashCell(seed, c.q, c.r) % WEAK_BOSSES.length];

/** Что ляжет на клетки задания: ключ клетки → правка. */
export function featurePatches(p: IslandPlaces, seed: number, gift = false, pillar?: ShortSpellPillar): Map<string, Patch> {
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
      rewardConfig: chestReward(gift, !!p.lesson, pillar),
    },
  });
  for (const t of p.trees) put(t, { decorationId: ISLAND_DECOR.oak });
  for (const c of p.crystals) put(c, { decorationId: ISLAND_DECOR.stone });
  p.monsters.forEach((m, i) => {
    const kind = bossKind(i, m, seed);
    // На клетке только руда; лайки, пак, артефакт и золото бросает сервер.
    const reward = lootConfig(i === 0 ? ISLAND_LOOT.slime : ISLAND_LOOT.boss);
    // HP и цена удара — шаблона, как у тех же боссов в мире; своя у клетки
    // только награда острова. Энергия ×0,1 (21.10) — при списании, energy.ts.
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
  // Шахты — сломанные и ничьи: строки владения нет, берёт тот, кто починит.
  const mine = (c: At, res: IslandMineRes) =>
    put(c, { buildingId: ISLAND_MINES[res], buildingConfig: islandMineConfig(res) });
  mine(p.mine, "wood");
  ISLAND_EXTRA_MINES.forEach((res, i) => {
    if (p.mines[i]) mine(p.mines[i], res);
  });
  put(p.portal, { buildingId: ISLAND_BUILDINGS.portal, tier: 0, buildingConfig: portalConfig() });
  // Верфь готова к спуску обычного корабля (тир 1 — SHIPYARD_TIER_SMALL): корабль
  // игрок строит сам, по цене мира.
  if (p.shipyard)
    put(p.shipyard, { buildingId: ISLAND_BUILDINGS.shipyard, tier: SHIPYARD_TIER_SMALL });
  if (p.lesson?.pillar && pillar) put(p.lesson.pillar, {
    buildingId: pillar.buildingId, buildingSkinId: pillar.buildingSkinId, tier: pillar.tier,
    buildingConfig: { effect: "spellbook", spellbook: pillar.spellbook },
  });
  return out;
}

/** Применить правки к клеткам острова (местность клетки не меняется). */
export function applyFeatures(
  cells: readonly WorldCell[],
  p: IslandPlaces,
  seed: number,
  gift = false,
  pillar?: ShortSpellPillar,
): WorldCell[] {
  const patches = featurePatches(p, seed, gift, pillar);
  return cells.map((c) => {
    const patch = patches.get(keyOf(c));
    return patch ? { ...c, ...patch, mode: "built" as const } : c;
  });
}
