// Остров новичка целиком: форма, природа, один город и клетки задания.
//
// Тот же генератор миров (worldgen) со спецификацией живого мира — земли,
// декор, наборы городов, — только местность подложена островом (shape), своих
// объектов мира нет (мобов ставит задание, слабых), а места под города
// генератор не ищет: единственный город острова строится явно, рядом с центром.
// Чистая функция (спецификация, справочник, сид): тот же сид — тот же остров.
import { shortLake } from "./shortTutorial";
import type { ShortSpellPillar } from "./shortSpell";
import { applyEdit, editsOf } from "@/lib/raid/worldgen/overlay";
import { generateArea } from "@/lib/raid/worldgen/area";
import { townDecorAt } from "@/lib/raid/worldgen/cover";
import { isWaterId, makeWorld } from "@/lib/raid/worldgen/field";
import { chunksOfSize, inBounds, type Cell } from "@/lib/raid/worldgen/geo";
import { hallConfig } from "@/lib/raid/worldgen/hall";
import { buildTown, type TownCatalog } from "@/lib/raid/worldgen/town";
import { keyOf } from "@/lib/raid/zonegen/town/hex";
import type { WorldCell, WorldHall, WorldShop, WorldSpec } from "@/lib/raid/worldgen/spec";
import { ISLAND_SIZE, islandCenter, prefillIsland } from "@/lib/raid/island/shape";
import { pickPlaces } from "@/lib/raid/island/places";
import { applyFeatures } from "@/lib/raid/island/features";
import { carvePaths, connectPockets } from "@/lib/raid/island/carve";
import { islandTownSites } from "@/lib/raid/island/towns";
import { fishGoodsOf, withFish } from "@/lib/raid/island/townFish";
import type { IslandPlaces } from "@/lib/raid/island/steps";
import {
  hasTownHall,
  pickTemplate,
  templateBase,
  templateDecor,
  templateTown,
  type FootCell,
  type TownTemplate,
} from "@/lib/raid/island/townTemplate";

export { ISLAND_TOWN_SIZE } from "@/lib/raid/island/towns";
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

/** Положен ли аккаунту подарок острова в первом сундуке (false — уже получал). */
export type IslandPrizes = { gift: boolean; short?: boolean; pillar?: ShortSpellPillar };

export function generateIsland(
  base: WorldSpec,
  catalog: TownCatalog,
  seed: number,
  prizes?: IslandPrizes,
  /** Шаблоны городов Ангелины (включённые); есть — города по ним, без ратуши — выращенный. */
  templates: readonly TownTemplate[] = [],
): Island {
  const w = makeWorld(islandSpec(base, seed));
  const center = islandCenter();
  const lands = prefillIsland(w, center);
  const bounds = { size: ISLAND_SIZE };
  const area = generateArea(w, { chunks: chunksOfSize(ISLAND_SIZE), bounds, catalog });

  // Города: первый — главный (задание, его ратуша — замок задания), прочие — врозь.
  const sites = islandTownSites(w, center, seed);
  const usable = templates.filter((t) => hasTownHall(t, catalog));
  const placed = sites.map((s) => {
    const tpl = pickTemplate(usable, s.seed);
    return tpl ? templateTown(w, s, catalog, bounds, tpl) : null;
  });
  const towns = sites.map((s, k) => placed[k]?.town ?? buildTown(w, s, catalog, bounds));
  // Клетки шаблонов: «q,r» → слои (местность, дорога, декор — как нарисовала Ангелина).
  const footprint = new Map<string, FootCell>();
  for (const p of placed) for (const [k, c] of p?.footprint ?? []) footprint.set(k, c);
  const [site, town] = [sites[0], towns[0]];
  const edits = editsOf({ towns, roads: [] }, w.spec.towns.roadId, (t, q, r) =>
    townDecorAt(w, t.race, q, r),
  );
  let cells: WorldCell[] = area.cells.map((c) => {
    const tc = footprint.get(keyOf(c));
    const base = tc ? templateBase(c, tc, lands.main, isWaterId(w, c.terrainId)) : c;
    const e = edits.get(keyOf(c));
    const built = e === undefined ? base : { ...applyEdit(base, e), mode: "built" as const };
    return tc ? templateDecor(built, tc) : built;
  });

  const originalWater = new Set(cells.filter((c) => isWaterId(w, c.terrainId)).map(keyOf));
  const lake = prizes?.short ? shortLake(cells, w.spec.water.shallow, originalWater, site, new Set(footprint.keys()), !!prizes.pillar) : null;
  if (lake) cells = lake.cells;
  const water = new Set(cells.filter((c) => isWaterId(w, c.terrainId)).map((c) => keyOf(c)));
  const shallow = new Set(
    cells.filter((c) => c.terrainId === w.spec.water.shallow).map((c) => keyOf(c)),
  );
  // Клетки блоков шаблона — под картинкой постройки: заданию туда нельзя.
  const taken = new Set([...footprint].filter(([, c]) => c.gid !== null).map(([k]) => k));
  for (const key of lake?.reserved ?? []) taken.add(key);
  const places = pickPlaces({ cells, water, shallow, town: site, hall: town.hall, seed, taken, startAtHall: !!lake });
  // Подарок острова — раз на аккаунт (владелец, 17.10.2026: «чтобы не было
  // ферм»): уже получал — в первом сундуке только доски.
  places.gift = prizes?.gift ?? true;
  if (lake) {
    if (!places.hall) throw new Error("На острове нет замка для начала обучения.");
    places.lesson = lake.lesson; places.shipyard = lake.yard; places.spawn = places.hall;
  }
  cells = applyFeatures(cells, places, seed, places.gift, prizes?.pillar);
  const targets: Cell[] = [
    places.chest,
    places.workshop,
    places.mine,
    ...places.mines,
    places.treasure,
    places.portal,
    ...places.trees,
    ...places.monsters,
    ...places.crystals,
    ...places.digs,
    ...(places.shipyard ? [places.shipyard] : []),
    ...(places.lesson && !places.lesson.pillar ? [places.lesson.shore] : []),
    ...(places.hall ? [places.hall] : []),
  ];
  const keep = new Set([...places.trees, ...places.crystals].map((c) => keyOf(c)));
  const pass = { cells, water, walk: w.walk, start: places.spawn, keep };
  // Сначала проход к каждой цели задания, потом — к каждому пятачку суши.
  const carved = carvePaths({ ...pass, targets }) + connectPockets(pass);

  const inside = (c: Cell) => inBounds(bounds, c.q, c.r);
  // Рыбу принимает каждая ратуша острова — и её лавки (townFish).
  const fish = fishGoodsOf(w.spec.towns.templates);
  const halls: WorldHall[] = [];
  const shops: WorldShop[] = [];
  towns.forEach((t, k) => {
    const hall = t.hall && inside(t.hall) ? t.hall : null;
    if (!hall) return;
    const config = withFish(hallConfig(w.spec.towns.templates, sites[k].seed, t.name), fish);
    halls.push({ ...hall, config });
    shops.push(...t.markets.filter(inside).map((m) => ({ ...m, hallQ: hall.q, hallR: hall.r })));
  });
  return { cells, halls, shops, places, townName: town.name, carved };
}
