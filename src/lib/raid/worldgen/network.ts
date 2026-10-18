// Сеть дорог мира (владелец, 06.10.2026: «нужно, чтобы просто так были дороги —
// чтобы была возможность проходить между местностями»).
//
// Узлы — перекрёстки и города. Перекрёсток — опорная точка области земли
// (field.regionPoint), а если она в озере — ближайшая к ней суша (не дальше
// LAND_SEEK клеток), в рамке и не внутри города: у каждой области свой,
// поэтому дороги ведут из земли в землю. Связь — граф
// относительного соседства: пара связана, если между узлами не дальше двух
// поперечников области и нет третьего узла, что ближе к обоим. Путь —
// links.routeRoad: по суше, мимо домов, по улицам дёшево, сквозь декор (на
// дороге его нет). Ответ зависит только от узлов вокруг пары — порядок, в
// котором растут чанки, на него не влияет.
import { disk, hexDist } from "@/lib/raid/zonegen/town/hex";
import { hexToXY } from "@/lib/raid/zonegen/noise";
import {
  REGION_SIZE,
  isWaterId,
  regionPoint,
  terrainAt,
  type World,
} from "@/lib/raid/worldgen/field";
import { inBounds, xyToHex, type Bounds, type Cell } from "@/lib/raid/worldgen/geo";
import { WINDOW_PAD, routeRoad, takenOf, windowCorners } from "@/lib/raid/worldgen/links";
import { ZONE_MAX, sitesNear, zoneRadius } from "@/lib/raid/worldgen/sites";
import { buildTown, type BuiltTown, type TownCatalog } from "@/lib/raid/worldgen/town";

/** Опорная точка в воде — перекрёсток ищется на суше не дальше стольких клеток. */
const LAND_SEEK = 9;

/** Узлы связаны не дальше двух поперечников области. */
export const LINK_MAX = 2 * REGION_SIZE;

export type RoadNode = Cell & { key: string; town: BuiltTown | null };

export type Box = { q0: number; q1: number; r0: number; r1: number };

export function boxOf(cells: readonly Cell[], pad: number): Box {
  let [q0, q1, r0, r1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const c of cells)
    [q0, q1, r0, r1] = [Math.min(q0, c.q), Math.max(q1, c.q), Math.min(r0, c.r), Math.max(r1, c.r)];
  return { q0: q0 - pad, q1: q1 + pad, r0: r0 - pad, r1: r1 + pad };
}

const overlaps = (a: Box, b: Box) => a.q0 <= b.q1 && b.q0 <= a.q1 && a.r0 <= b.r1 && b.r0 <= a.r1;
const within = (b: Box, c: Cell) => c.q >= b.q0 && c.q <= b.q1 && c.r >= b.r0 && c.r <= b.r1;

/** Город места — из памяти мира (он чистая функция места). */
export function townOf(
  w: World,
  site: Parameters<typeof buildTown>[1],
  cat: TownCatalog,
  bounds: Bounds,
): BuiltTown {
  let t = w.cache.towns.get(site.key);
  if (t === undefined) w.cache.towns.set(site.key, (t = buildTown(w, site, cat, bounds)));
  return t;
}

/** Перекрёстки областей у клеток cells (с запасом pad): на суше, в рамке, не в городе. */
function crossroads(
  w: World,
  cells: readonly Cell[],
  pad: number,
  bounds: Bounds,
  towns: readonly BuiltTown[],
): RoadNode[] {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const c of cells) {
    const { x, y } = hexToXY(c.q, c.r);
    [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
  }
  const out: RoadNode[] = [];
  for (
    let j = Math.floor((y0 - pad) / REGION_SIZE);
    j <= Math.floor((y1 + pad) / REGION_SIZE);
    j++
  ) {
    for (
      let i = Math.floor((x0 - pad) / REGION_SIZE);
      i <= Math.floor((x1 + pad) / REGION_SIZE);
      i++
    ) {
      const p = regionPoint(w, i, j);
      const c = landNear(w, xyToHex(p.x, p.y), bounds);
      if (c === null) continue;
      if (towns.some((t) => hexDist(c, t.site) <= zoneRadius(t.site.n) + 1)) continue;
      out.push({ ...c, key: `x:${i},${j}`, town: null });
    }
  }
  return out;
}

/** Ближайшая к точке суша в рамке (ничья — по ключу клетки); нет — null. */
function landNear(w: World, at: Cell, bounds: Bounds): Cell | null {
  let best: Cell | null = null;
  let bestD = Infinity;
  for (const c of disk(at, LAND_SEEK)) {
    if (!inBounds(bounds, c.q, c.r) || isWaterId(w, terrainAt(w, c.q, c.r))) continue;
    const d = hexDist(c, at);
    if (d < bestD || (d === bestD && best !== null && (c.r - best.r || c.q - best.q) < 0)) {
      [best, bestD] = [c, d];
    }
  }
  return best;
}

export type Network = { towns: BuiltTown[]; roads: string[][] };

/**
 * Города и дороги, задевающие прямоугольник target (клетки участка с запасом
 * под ячейки лабиринта). Узлов берём с запасом: у пары, чьё окно задевает
 * target, оба конца — в пределах LINK_MAX + окно, а проверка «нет узла ближе к
 * обоим» смотрит ещё на LINK_MAX дальше.
 */
export function networkNear(
  w: World,
  cells: readonly Cell[],
  margin: number,
  cat: TownCatalog,
  bounds: Bounds,
): Network {
  const target = boxOf(cells, margin);
  const reach = margin + 2 * LINK_MAX + WINDOW_PAD;
  const towns = sitesNear(w, cells, bounds, reach).map((s) => townOf(w, s, cat, bounds));
  const nodes: RoadNode[] = [
    ...towns.map((t) => ({ q: t.site.q, r: t.site.r, key: `t:${t.site.key}`, town: t })),
    ...crossroads(w, cells, reach, bounds, towns),
  ].sort((a, b) => (a.key < b.key ? -1 : 1));
  const ends = boxOf(cells, margin + LINK_MAX + WINDOW_PAD);
  const roads: string[][] = [];
  if (w.spec.towns.roadId === null) return { towns, roads };
  for (const a of nodes) {
    if (!within(ends, a)) continue;
    for (const b of nodes) {
      if (!(a.key < b.key) || !within(ends, b)) continue;
      const d = hexDist(a, b);
      if (d > LINK_MAX) continue;
      if (nodes.some((c) => c !== a && c !== b && hexDist(a, c) < d && hexDist(b, c) < d)) continue;
      const win = windowCorners(a, b);
      if (!overlaps(boxOf(win, 0), target)) continue;
      const pk = `${a.key}|${b.key}`;
      let path = w.cache.routes.get(pk);
      if (path === undefined) {
        // Дома и улицы всех городов, задевающих окно пары, — и только их.
        const near = sitesNear(w, win, bounds, 0).map((s) => townOf(w, s, cat, bounds));
        path = routeRoad(w, a.town ?? a, b.town ?? b, takenOf(near), bounds);
        w.cache.routes.set(pk, path);
      }
      if (path !== null) roads.push(path);
    }
  }
  return { towns, roads };
}
