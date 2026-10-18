// Дорожная сеть поселения: цена шага, прокладка пути, связность.
//
// Спецификация (docs/town-generation-algorithm.json, шаги 6 и 15): свободная
// клетка стоит 1.0 + шум [0; 0.3] от сида (изгибы, как у рек HoMM3), уже
// проложенная дорога — 0.2 (w_ex ≪ 1 у Emilien 2012, 1/10 у HoMM3), клетка у
// воды — 1.2, blocked — ∞. Дешёвая готовая дорога и есть причина, по которой
// пути сливаются в дерево с Y-развилками, а магистраль ложится на дорогу карты.
// Мостов нет: в справочнике построек моста нет, а воду дорога не пересекает.
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { hexToXY, makeNoise } from "@/lib/raid/zonegen/noise";
import { findPath, type PathStep } from "@/lib/raid/zonegen/town/astar";
import { bfs, dist } from "@/lib/raid/zonegen/town/fields";
import { disk, hexDist, keyOf, parseKey, subSeed } from "@/lib/raid/zonegen/town/hex";
import type { TownFields } from "@/lib/raid/zonegen/town/types";

/** Ранги дорог (шаг 7): магистраль 1, улица 0.5, переулок 0.25. */
export const RANK_MAIN = 1;
export const RANK_STREET = 0.5;
export const RANK_LANE = 0.25;

const FREE_COST = 1;
const NOISE_SPAN = 0.3;
export const ROAD_COST = 0.2;
const SHORE_COST = 1.2;
/**
 * Прорезка (шаг 15, «прорезается самый дешёвый путь»): через непроходимый
 * декор — за 3, как мост у Parish–Müller; декор под дорогой писатель стирает.
 * Через воду и чужие постройки не режем никогда.
 */
const CUT_COST = 3;
/** Масштаб шума изгибов в клетках: плавная кривая, а не рябь по клетке. */
const NOISE_SCALE = 3;
/** Ворота на Rb, вынос за ворота ≤ 6 — дальше Rb+8 поиску делать нечего. */
const REACH_PAD = 8;
/** Эвристика по ближайшей цели считается, пока целей немного. */
const HEUR_GOALS = 24;

export type RoadNet = {
  fields: TownFields;
  /** Ключ «q,r» → ранг. Сюда же ложатся площадь и клетки дорог карты, по которым прошли. */
  roads: Map<string, number>;
  /** Куда дорогу не кладём сверх непроходимого: луг, место ратуши, костёр, постройки. */
  reserved: ReadonlySet<string>;
  /** Непроходимый декор зоны — его можно прорезать при починке (шаг 15). */
  cuttable: ReadonlySet<string>;
  seed: number;
  center: ZoneCell;
  radius: number;
};

/** Цена входа в клетку по шагу 6; cut — починка, декор режется за 3. */
export function costModel(net: RoadNet, cut = false): (k: string) => number {
  const noise = makeNoise(subSeed(net.seed, "roads"));
  const reach = net.radius + REACH_PAD;
  return (k) => {
    if (net.reserved.has(k)) return Number.POSITIVE_INFINITY;
    const c = parseKey(k);
    if (hexDist(c, net.center) > reach) return Number.POSITIVE_INFINITY;
    const p = hexToXY(c.q, c.r);
    const wiggle = NOISE_SPAN * noise(p.x / NOISE_SCALE, p.y / NOISE_SCALE);
    if (!net.fields.land.has(k))
      return cut && net.cuttable.has(k) ? CUT_COST + wiggle : Number.POSITIVE_INFINITY;
    if (net.roads.has(k) || net.fields.mapRoads.has(k)) return ROAD_COST;
    return (dist(net.fields.dWater, k) === 1 ? SHORE_COST : FREE_COST) + wiggle;
  };
}

export type RouteOptions = {
  cut?: boolean;
  /** Клетки, закрытые именно для этого пути (луг Angerdorf, первая улица вокруг него). */
  avoid?: ReadonlySet<string>;
  maxSteps?: number;
  allow?: (s: PathStep) => boolean;
};

/** Кратчайший путь по цене шага 6 от источников до ближайшей цели. */
export function route(
  net: RoadNet,
  sources: readonly string[],
  goals: ReadonlySet<string>,
  opt: RouteOptions = {},
): string[] | null {
  if (goals.size === 0) return null;
  const cost = costModel(net, opt.cut === true);
  const targets = goals.size <= HEUR_GOALS ? [...goals].map(parseKey) : null;
  const heuristic =
    targets === null
      ? undefined
      : (k: string) => {
          const c = parseKey(k);
          let d = Number.POSITIVE_INFINITY;
          for (const t of targets) d = Math.min(d, hexDist(c, t));
          return ROAD_COST * d;
        };
  return findPath({
    sources,
    isGoal: (k) => goals.has(k),
    enterCost: (k) => (opt.avoid?.has(k) === true ? Number.POSITIVE_INFINITY : cost(k)),
    heuristic,
    maxSteps: opt.maxSteps,
    allow: opt.allow,
  });
}

/** Положить путь в сеть; ранг клетки — максимум из старого и нового. */
export function layPath(net: RoadNet, path: readonly string[], rank: number): void {
  for (const k of path) net.roads.set(k, Math.max(net.roads.get(k) ?? 0, rank));
}

/**
 * Узел поселения: дорожные клетки, касающиеся центра, площади или луга (или
 * сам центр, если он — перекрёсток). От них меряется связность шага 15.
 */
export function hubRoads(net: RoadNet, core: readonly ZoneCell[]): string[] {
  const around = new Set<string>();
  for (const c of core) for (const x of disk(c, 1)) around.add(keyOf(x));
  return [...around].filter((k) => net.roads.has(k));
}

/** Куда вести первую дорогу, если сети ещё нет: суша у ядра, кроме луга и места ратуши. */
function hubArea(net: RoadNet, core: readonly ZoneCell[]): Set<string> {
  const out = new Set<string>();
  for (const c of core) {
    for (const x of disk(c, 1)) {
      const k = keyOf(x);
      if (net.fields.land.has(k) && !net.reserved.has(k)) out.add(k);
    }
  }
  return out;
}

/** Все дорожные клетки, связанные с узлом по дорогам. */
export function reachable(net: RoadNet, core: readonly ZoneCell[]): Set<string> {
  return new Set(bfs(hubRoads(net, core), (k) => net.roads.has(k)).keys());
}

/**
 * Проверка и починка (шаг 15): Дейкстра от узла — ворота обязаны быть
 * достижимы. Недостижимые получают самый дешёвый путь к связной части сети,
 * с прорезкой декора; кого не спасла и прорезка — выбывает (остров, отрезанный
 * водой). Возвращает ворота, которые остались связными.
 */
export function repairGates(
  net: RoadNet,
  gates: readonly ZoneCell[],
  core: readonly ZoneCell[],
): ZoneCell[] {
  const kept: ZoneCell[] = [];
  for (const g of gates) {
    const joined = reachable(net, core);
    const k = keyOf(g);
    if (joined.has(k)) {
      kept.push(g);
      continue;
    }
    const goals = joined.size > 0 ? joined : hubArea(net, core);
    const path = route(net, [k], goals, { cut: true });
    if (path === null) continue;
    layPath(net, path, RANK_MAIN);
    kept.push(g);
  }
  return kept;
}
