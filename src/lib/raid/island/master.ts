// Остров-образец (владелец, 04.11.2026: «остров Бар-На образцом для всех»;
// 05.11.2026: «он должен быть реально унифицированным — где она что поставит —
// должно появляться у новичков»). Новый остров — точная копия образца: местность,
// дороги, декор, постройки, блоки, ратуши, цели обучения, бойцы, дубы, камни и
// клады — на тех же местах и те же. Бойцы — по точкам возрождения образца: каждый
// на своей клетке (и убитый на образце — тоже), сошедший с клетки — не копия.
// Дубы, камни, шахты, верфь и мастерская задания — там, где стоят у образца
// сейчас (свои места расстановки образца устарели: она перерисовала остров). Проходы не прорубаются — декор,
// дороги и постройки образца не трогаются. Первый сундук — по подарку аккаунта;
// короткое обучение (урок у озера) — только тому, кому оно положено.
// Чистая функция: тот же образец и сид — тот же остров.
import { hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import type { Cell } from "@/lib/raid/worldgen/geo";
import type { WorldCell, WorldHall } from "@/lib/raid/worldgen/spec";
import {
  ISLAND_BUILDINGS,
  ISLAND_DECOR,
  ISLAND_EXTRA_MINES,
  ISLAND_MINES,
  islandMineConfig,
  type IslandMineRes,
} from "@/lib/raid/island/catalog";
import { SHIPYARD_TIER_SMALL } from "@/lib/shipRules";
import { featurePatches } from "@/lib/raid/island/features";
import { keepOffWater } from "@/lib/raid/island/masterDry";
import type { Island, IslandPrizes } from "@/lib/raid/island/generate";
import type { IslandPlaces } from "@/lib/raid/island/steps";

/** Точка возрождения бойца образца: клетка (дом), где он сейчас, кто он. */
export type MasterBoss = Cell & {
  cur: Cell | null;
  objectId: string;
  objectConfig: unknown;
  /** Родная местность бойца — вода (крабы, сирены): ему в воде можно (masterDry). */
  swims?: boolean;
};

export type MasterIsland = {
  mapId: string;
  /** Имя города образца — имя нового острова. */
  name: string;
  cells: WorldCell[];
  places: IslandPlaces;
  halls: WorldHall[];
  /** Точки возрождения бойцов образца (raid_mob_spawn); нет — бойцы как на клетках. */
  bosses?: MasterBoss[];
  /** Местности-вода образца: сухопутных бойцов и клады копия ставит на сушу (masterDry). */
  water?: string[];
  /** Местности-горы образца: бойцов копия с них снимает (masterDry). */
  mountains?: string[];
  /** Бойцы образца (objectId), чья родная местность вода: им в воде можно. */
  swimmers?: string[];
};

const near = (from: Cell) => (a: Cell, b: Cell) =>
  hexDist(a, from) - hexDist(b, from) || a.q - b.q || a.r - b.r;

/** Клетки с этим декором — ближние к старту первыми (первая — цель «Показать»). */
function decorCells(cells: readonly WorldCell[], decor: string, from: Cell): Cell[] {
  return cells
    .filter((c) => c.decorationId === decor)
    .map((c) => ({ q: c.q, r: c.r }))
    .sort(near(from));
}

/** Ближайшая к старту постройка этого шаблона; нет — прежняя клетка задания. */
function buildingCell(cells: readonly WorldCell[], id: string, from: Cell, old: Cell): Cell {
  const found = cells.filter((c) => c.buildingId === id).sort(near(from))[0];
  return found ? { q: found.q, r: found.r } : old;
}

/**
 * Постройки задания — там, где они стоят у образца (она переставила шахты и
 * верфь): цели шагов идут за ними. Шахта острова — со своей настройкой
 * (сломанная, ничья, цены починки острова), верфь — готова к спуску корабля.
 */
function taskBuildings(cells: WorldCell[], m: IslandPlaces) {
  const from = m.spawn;
  const mineAt = (res: IslandMineRes, old: Cell) =>
    buildingCell(cells, ISLAND_MINES[res], from, old);
  const mine = mineAt("wood", m.mine);
  const mines = ISLAND_EXTRA_MINES.map((res, i) => mineAt(res, m.mines[i] ?? m.mine));
  const workshop = buildingCell(cells, ISLAND_BUILDINGS.workshop, from, m.workshop);
  const shipyard = m.shipyard
    ? buildingCell(cells, ISLAND_BUILDINGS.shipyard, from, m.shipyard)
    : m.shipyard;
  const mineRes = new Map<string, IslandMineRes>(
    (Object.keys(ISLAND_MINES) as IslandMineRes[]).map((res) => [ISLAND_MINES[res], res]),
  );
  for (const c of cells) {
    const res = c.buildingId ? mineRes.get(c.buildingId) : undefined;
    if (res) c.buildingConfig = islandMineConfig(res);
    if (c.buildingId === ISLAND_BUILDINGS.shipyard && c.tier == null) c.tier = SHIPYARD_TIER_SMALL;
  }
  return { mine, mines, workshop, ...(shipyard ? { shipyard } : {}) };
}

/** Бойцы — на свои клетки; сошедшие с клетки — прочь. */
function placeBosses(cells: readonly WorldCell[], bosses: readonly MasterBoss[]): WorldCell[] {
  const home = new Map(bosses.map((b) => [keyOf(b), b]));
  const away = new Set(
    bosses.flatMap((b) => (b.cur && keyOf(b.cur) !== keyOf(b) ? [keyOf(b.cur)] : [])),
  );
  return cells.map((c) => {
    const b = home.get(keyOf(c));
    if (b) return { ...c, objectId: b.objectId, objectConfig: b.objectConfig, mode: "built" };
    if (away.has(keyOf(c)) && c.objectId?.startsWith("boss:"))
      return { ...c, objectId: null, objectConfig: null, mode: "built" };
    return { ...c, mode: "built" };
  });
}

/** Новый остров по образцу. */
export function islandFromMaster(master: MasterIsland, seed: number, prizes: IslandPrizes): Island {
  const dry = keepOffWater(master.cells, master.bosses ?? [], master.places, new Set(master.water ?? []),
    new Set(master.mountains ?? []), new Set(master.swimmers ?? []));
  const cells = placeBosses(master.cells, dry.bosses);
  // Бойцы без точки возрождения, что стояли в воде или на горе, — на свою сушу.
  const byKey = new Map(cells.map((c) => [keyOf(c), c]));
  for (const l of dry.loose) {
    const a = byKey.get(keyOf(l.from));
    const b = byKey.get(keyOf(l.to));
    if (!a || !b || b.objectId) continue;
    Object.assign(b, { objectId: a.objectId, objectConfig: a.objectConfig });
    Object.assign(a, { objectId: null, objectConfig: null });
  }
  const m = dry.places;
  const places: IslandPlaces = {
    ...m,
    ...taskBuildings(cells, m),
    trees: decorCells(cells, ISLAND_DECOR.oak, m.spawn),
    crystals: decorCells(cells, ISLAND_DECOR.stone, m.spawn),
    artifact: null,
    pack: null,
    gift: prizes.gift,
  };
  // Урок у озера — только короткому обучению; у прочих остаются озеро и постройки.
  if (!prizes.short) delete places.lesson;
  // Сундук — всегда заново (подарок по аккаунту). Боец без точки возрождения
  // на своей клетке — встаёт, клетку (дорогу, декор) не трогаем.
  const patches = featurePatches(places, seed, places.gift, prizes.pillar);
  const at = new Map(cells.map((c) => [keyOf(c), c]));
  const chest = at.get(keyOf(places.chest));
  const chestPatch = patches.get(keyOf(places.chest));
  if (chest && chestPatch) Object.assign(chest, chestPatch, { mode: "built" as const });
  for (const p of places.monsters) {
    const c = at.get(keyOf(p));
    const patch = patches.get(keyOf(p));
    if (c && patch && !c.objectId?.startsWith("boss:"))
      Object.assign(c, { objectId: patch.objectId, objectConfig: patch.objectConfig });
  }
  return { cells, halls: master.halls, shops: [], places, townName: master.name, carved: 0 };
}
