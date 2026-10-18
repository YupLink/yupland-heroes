// Город на месте: органический рост генератора зон (zonegen/town/place —
// docs/town-generation-algorithm.json) на зоне вокруг места, ратуша и лавки.
//
// Рост тот же, что у кисти «Биом» в режиме бога: центр, въезды, магистрали,
// службы по правилам соседства, жильё. Отличие одно — зона: не выделение
// админа, а круг вокруг места с местностью мира (терраин клеток считает поле,
// базу никто не спрашивает), поэтому город — чистая функция (мир, место).
//
// Город — одной расы (владелец, 07.10.2026: «если деревня единорогов — то
// только постройки из их коллекции»): раса по сиду среди коллекций
// (collections.ts), каждая постройка — в облике этой расы, облик — свой у
// каждой клетки. Ратуша есть в каждом городе (meta.effect = town_hall; имя
// «Ратуша» без поля — декорация). К ней привязываются ВСЕ рынки города, и
// лавки, и рынки-«дворы» фона: в новом мире ни у одного рынка нет своего
// товара, и непривязанный стоял бы пустым. Храм получает настройку одного из
// храмов образца (spec.towns.configs): без неё алтарь молчит.
//
// v4: город — по набору с городов образца (kits.ts): облик ратуши, его
// постройки и табличка у въезда «Город Драконов - Зура» (town-sign).
import { disk, keyOf } from "@/lib/raid/zonegen/town/hex";
import { placeTown } from "@/lib/raid/zonegen/town/place";
import { isWaterId, terrainAt, type World } from "@/lib/raid/worldgen/field";
import { inBounds, type Bounds, type Cell } from "@/lib/raid/worldgen/geo";
import { zoneRadius, type TownSite } from "@/lib/raid/worldgen/sites";
import { townName } from "@/lib/raid/worldgen/hall";
import { onTerrain, raceTownFor, skinAt, type RaceTown } from "@/lib/raid/worldgen/collections";
import { signCell, signText } from "@/lib/raid/worldgen/town-sign";
import { hashCell } from "@/lib/raid/zonegen/town/hex";
import type { BuildingOption, ZoneStructure } from "@/lib/raid/zonegen/settlement-types";
import type { RoleOption } from "@/lib/raid/zonegen/town/types";

/** Вода за краем зоны тоже видна росту — «не дальше 6 клеток» (town-context.TOWN_REACH). */
const TOWN_REACH_CELLS = 6;

export type BuiltTown = {
  site: TownSite;
  name: string;
  /** Раса города (коллекция обликов); null — справочника рас нет. */
  race: string | null;
  structures: ZoneStructure[];
  /** Площадь (центр скелета): отсюда тянутся тракты к соседям. */
  center: Cell | null;
  hall: Cell | null;
  markets: Cell[];
  buildings: number;
  /** Своя настройка постройки (храм с образца): «q,r» → building_config. */
  configs: Map<string, Record<string, unknown>>;
};

/** Справочник построек глазами мира: роли для роста и эффекты по id. */
export type TownCatalog = {
  options: RoleOption[];
  byId: ReadonlyMap<string, BuildingOption>;
  /** Коллекции рас (collections.raceTowns); пусто — город по всему справочнику. */
  races: RaceTown[];
};

export function townCatalog(
  options: RoleOption[],
  all: BuildingOption[],
  races: RaceTown[] = [],
): TownCatalog {
  return { options, byId: new Map(all.map((b) => [b.id, b])), races };
}

/** Своя настройка постройки с образца по её функции: храм — алтарь образца. */
function configAt(w: World, effect: string | null, q: number, r: number) {
  const list = effect ? (w.spec.towns.configs?.[effect] ?? []) : [];
  if (list.length === 0) return null;
  return list[hashCell(w.spec.seed ^ 0x2545f491, q, r) % list.length];
}

const effectAt = (cat: TownCatalog, s: ZoneStructure | undefined): string | null =>
  (typeof s?.buildingId === "string" ? cat.byId.get(s.buildingId)?.effect : null) ?? null;

export function buildTown(w: World, site: TownSite, cat: TownCatalog, bounds: Bounds): BuiltTown {
  const radius = zoneRadius(site.n);
  const cells = disk(site, radius).filter((c) => inBounds(bounds, c.q, c.r));
  // Вода зоны и кольца вокруг — порт узнаёт берег, въезды не идут в море.
  const water = new Set<string>();
  for (const c of disk(site, radius + TOWN_REACH_CELLS)) {
    if (isWaterId(w, terrainAt(w, c.q, c.r))) water.add(keyOf(c));
  }
  const terrainOf = new Map(cells.map((c) => [keyOf(c), terrainAt(w, c.q, c.r)]));
  // Раса — по земле под городом: драконы на болотах, единороги на своей земле.
  const ground = terrainAt(w, site.q, site.r);
  const town = raceTownFor(cat.races, site.seed, ground);
  const res = placeTown({
    cells,
    occupied: new Set(),
    water,
    decorBlocked: new Set(),
    mapRoads: new Set(),
    seed: site.seed,
    buildings: site.n,
    theme: town?.race ?? "",
    kind: "auto",
    hall: true,
    shop: true,
    options: town ? onTerrain(town, ground) : cat.options,
    manual: null,
    roadId: w.spec.towns.roadId,
    built: true,
    terrainOf,
  });
  // Облик — свой у каждой клетки из облика расы её постройки.
  const own = new Map((town?.options ?? []).map((o) => [o.id, o]));
  const structures = res.structures.map((s) =>
    town && typeof s.buildingId === "string"
      ? { ...s, buildingSkinId: skinAt(own.get(s.buildingId), site.seed, s.q, s.r) }
      : s,
  );
  const name = townName(site.seed);
  const configs = new Map<string, Record<string, unknown>>();
  const sign = town?.label && town.sign && cat.byId.has(town.sign.t) ? town.sign : null;
  const at = new Map(structures.map((s) => [keyOf(s), s]));
  const signAt =
    sign && res.skeleton
      ? signCell(res.skeleton.gates, res.skeleton.center, new Set(at.keys()), (c) => {
          return inBounds(bounds, c.q, c.r) && !isWaterId(w, terrainAt(w, c.q, c.r));
        })
      : null;
  if (sign && signAt) {
    structures.push({ q: signAt.q, r: signAt.r, buildingId: sign.t, buildingSkinId: sign.s });
    configs.set(keyOf(signAt), { text: signText(town?.label ?? "", name), effect: "sign" });
  }
  let hall: Cell | null = null;
  const markets: Cell[] = [];
  for (const p of res.placed) {
    const effect = effectAt(cat, at.get(keyOf(p)));
    if (p.role === "town_hall" && effect === "town_hall" && hall === null)
      hall = { q: p.q, r: p.r };
    else if (effect === "market" && p.role !== "barracks" && p.role !== "armory")
      markets.push({ q: p.q, r: p.r });
    const cfg = configAt(w, effect, p.q, p.r);
    if (cfg) configs.set(keyOf(p), cfg);
  }
  const buildings = structures.filter((s) => typeof s.buildingId === "string").length;
  return {
    site,
    name,
    race: town?.race ?? null,
    structures,
    center: res.skeleton?.center ?? null,
    hall,
    markets,
    buildings,
    configs,
  };
}
