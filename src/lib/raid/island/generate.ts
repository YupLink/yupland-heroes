// Остров новичка целиком: форма, природа, один город и клетки задания.
//
// Тот же генератор миров (worldgen) со спецификацией живого мира — земли,
// декор, наборы городов, — только местность подложена островом (shape), своих
// объектов мира нет (мобов ставит задание, слабых), а места под города
// генератор не ищет: единственный город острова строится явно, рядом с центром.
// Чистая функция (спецификация, справочник, сид): тот же сид — тот же остров.
import { applyEdit, editsOf } from "@/lib/raid/worldgen/overlay";
import { generateArea } from "@/lib/raid/worldgen/area";
import { townDecorAt } from "@/lib/raid/worldgen/cover";
import { isWaterId, makeWorld } from "@/lib/raid/worldgen/field";
import { chunksOfSize, inBounds, type Cell } from "@/lib/raid/worldgen/geo";
import { hallConfig } from "@/lib/raid/worldgen/hall";
import { buildTown, type TownCatalog } from "@/lib/raid/worldgen/town";
import { DIRS, hashCell, keyOf } from "@/lib/raid/zonegen/town/hex";
import type { WorldCell, WorldHall, WorldShop, WorldSpec } from "@/lib/raid/worldgen/spec";
import { ISLAND_SIZE, islandCenter, prefillIsland } from "@/lib/raid/island/shape";
import { pickPlaces } from "@/lib/raid/island/places";
import { applyFeatures } from "@/lib/raid/island/features";
import { carvePaths, connectPockets } from "@/lib/raid/island/carve";
import type { IslandPlaces } from "@/lib/raid/island/steps";

/** Построек в городе острова: хутор с ратушей и лавкой. */
export const ISLAND_TOWN_SIZE = 9;
/** Город сдвинут от центра: на другой стороне острова — дикая земля задания. */
const TOWN_SHIFT = 4;
/** Шаг сетки мест городов больше рамки: сам генератор городов не ставит. */
const NO_SITES = 200;

export type Island = {
  cells: WorldCell[];
  halls: WorldHall[];
  shops: WorldShop[];
  places: IslandPlaces;
  townName: string;
  /** Сколько клеток декора расчищено ради прохода к заданию. */
  carved: number;
};

/** Спецификация острова: мир-образец с новым сидом, без своих объектов и мест городов. */
export function islandSpec(base: WorldSpec, seed: number): WorldSpec {
  return { ...base, seed, objects: {}, towns: { ...base.towns, spacing: NO_SITES } };
}

/** Какие подарки ещё положены аккаунту (false — уже получал). */
export type IslandPrizes = { artifact: boolean; pack: boolean };

export function generateIsland(
  base: WorldSpec,
  catalog: TownCatalog,
  seed: number,
  prizes?: IslandPrizes,
): Island {
  const w = makeWorld(islandSpec(base, seed));
  const center = islandCenter();
  prefillIsland(w, center);
  const bounds = { size: ISLAND_SIZE };
  const area = generateArea(w, { chunks: chunksOfSize(ISLAND_SIZE), bounds, catalog });

  const [dq, dr] = DIRS[hashCell(seed, 5, 5) % DIRS.length];
  const site = {
    q: center.q + dq * TOWN_SHIFT,
    r: center.r + dr * TOWN_SHIFT,
    i: 0,
    j: 0,
    key: "isle",
    n: ISLAND_TOWN_SIZE,
    seed: hashCell(w.seeds.town, 0, 0),
  };
  const town = buildTown(w, site, catalog, bounds);
  const edits = editsOf({ towns: [town], roads: [] }, w.spec.towns.roadId, (t, q, r) =>
    townDecorAt(w, t.race, q, r),
  );
  let cells: WorldCell[] = area.cells.map((c) => {
    const e = edits.get(keyOf(c));
    return e === undefined ? c : { ...applyEdit(c, e), mode: "built" };
  });

  const water = new Set(cells.filter((c) => isWaterId(w, c.terrainId)).map((c) => keyOf(c)));
  const shallow = new Set(
    cells.filter((c) => c.terrainId === w.spec.water.shallow).map((c) => keyOf(c)),
  );
  const places = pickPlaces({ cells, water, shallow, town: site, hall: town.hall, seed });
  // Подарочные артефакт и пак — по одному на аккаунт (владелец, 17.10.2026:
  // «чтобы не было ферм»): уже получал — у этого острова призов нет.
  if (prizes?.artifact === false) places.artifact = null;
  if (prizes?.pack === false) places.pack = null;
  cells = applyFeatures(cells, places, seed);
  const targets: Cell[] = [
    places.chest,
    places.workshop,
    places.mine,
    places.treasure,
    places.portal,
    ...places.trees,
    ...places.monsters,
    ...places.crystals,
    ...places.digs,
    ...(places.shipyard ? [places.shipyard] : []),
    ...(places.hall ? [places.hall] : []),
  ];
  const keep = new Set([...places.trees, ...places.crystals].map((c) => keyOf(c)));
  const pass = { cells, water, walk: w.walk, start: places.spawn, keep };
  // Сначала проход к каждой цели задания, потом — к каждому пятачку суши.
  const carved = carvePaths({ ...pass, targets }) + connectPockets(pass);

  const inside = (c: Cell) => inBounds(bounds, c.q, c.r);
  const hall = town.hall && inside(town.hall) ? town.hall : null;
  const halls: WorldHall[] = hall
    ? [{ ...hall, config: hallConfig(w.spec.towns.templates, site.seed, town.name) }]
    : [];
  const shops: WorldShop[] = hall
    ? town.markets.filter(inside).map((m) => ({ ...m, hallQ: hall.q, hallR: hall.r }))
    : [];
  return { cells, halls, shops, places, townName: town.name, carved };
}
