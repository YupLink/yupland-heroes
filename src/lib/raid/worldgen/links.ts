// Путь дороги и что ей мешает. По воде дорог не бывает (владелец, 21.09) —
// берега связывают корабли и порталы.
//
// Кого с кем связать, решает network.ts (перекрёстки областей и города). Здесь —
// путь: A* по клеткам окна вокруг пары (road-path), по улице дёшево (дорога
// вливается в город), сквозь дом и воду нельзя, декор — не помеха: на дороге
// его не будет. Чужие дороги путь не видит — иначе он зависел бы от порядка
// роста чанков; две дороги на одной клетке — просто одна дорога.
import { hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import { roadPath } from "@/lib/raid/worldgen/road-path";
import { isWaterId, terrainAt, type World } from "@/lib/raid/worldgen/field";
import { inBounds, type Bounds, type Cell } from "@/lib/raid/worldgen/geo";
import type { BuiltTown } from "@/lib/raid/worldgen/town";

/** Окно поиска пути вокруг пары, клеток: озеро между городами обходится. */
export const WINDOW_PAD = 24;
/** Путь длиннее прямой больше чем вдвое — не тракт, а петля вокруг озера: тут связь — вода. */
const MAX_DETOUR = 2;
/** Шаг по улице города (как town/roads.ROAD_COST). */
const ROAD_COST = 0.2;

/** Что стоит на клетке у городов: дом (нельзя) или улица (дёшево). */
export type Taken = Map<string, "building" | "road">;

/** Угол окна пути пары — по нему ищутся города, чьи дома и улицы надо знать. */
export function windowCorners(a: Cell, b: Cell): Cell[] {
  const q0 = Math.min(a.q, b.q) - WINDOW_PAD;
  const q1 = Math.max(a.q, b.q) + WINDOW_PAD;
  const r0 = Math.min(a.r, b.r) - WINDOW_PAD;
  const r1 = Math.max(a.r, b.r) + WINDOW_PAD;
  return [
    { q: q0, r: r0 },
    { q: q1, r: r0 },
    { q: q0, r: r1 },
    { q: q1, r: r1 },
  ];
}

/** Дома и улицы городов. */
export function takenOf(towns: readonly BuiltTown[]): Taken {
  const taken: Taken = new Map();
  for (const t of towns) {
    for (const s of t.structures) {
      if (typeof s.buildingId === "string") taken.set(keyOf(s), "building");
      else if (typeof s.roadId === "string" && !taken.has(keyOf(s))) taken.set(keyOf(s), "road");
    }
  }
  return taken;
}

/**
 * Откуда тракт выходит из города: улица, ближайшая к соседу. В центре города
 * часто стоит ратуша — в дом путь не заходит, поэтому центр концом не годится.
 * Улиц нет (хутор) — центр, если он свободен.
 */
export function anchorOf(t: BuiltTown, toward: Cell, taken: Taken): Cell | null {
  let best: Cell | null = null;
  let bestD = Infinity;
  for (const s of t.structures) {
    if (typeof s.roadId !== "string") continue;
    const d = hexDist(s, toward);
    if (d < bestD || (d === bestD && best !== null && keyOf(s) < keyOf(best))) {
      [best, bestD] = [{ q: s.q, r: s.r }, d];
    }
  }
  if (best !== null) return best;
  return t.center !== null && taken.get(keyOf(t.center)) !== "building" ? t.center : null;
}

/** Конец дороги: город (выход с его улицы) или клетка-перекрёсток. */
export type RoadEnd = BuiltTown | Cell;

const isTown = (e: RoadEnd): e is BuiltTown => "structures" in e;
const posOf = (e: RoadEnd): Cell | null => (isTown(e) ? e.center : e);

/** Путь дороги от a до b (ключи клеток) или null — не дойти по суше или петля. */
export function routeRoad(
  w: World,
  a: RoadEnd,
  b: RoadEnd,
  taken: Taken,
  bounds: Bounds,
): string[] | null {
  const pa = posOf(a);
  const pb = posOf(b);
  if (pa === null || pb === null) return null;
  const from = isTown(a) ? anchorOf(a, pb, taken) : pa;
  const to = isTown(b) ? anchorOf(b, pa, taken) : pb;
  if (from === null || to === null) return null;
  const [lo, , , hi] = windowCorners(from, to);
  const cost = (q: number, r: number): number => {
    if (!inBounds(bounds, q, r)) return Infinity;
    const t = taken.get(keyOf({ q, r }));
    if (t === "building") return Infinity;
    if (t === "road") return ROAD_COST;
    return isWaterId(w, terrainAt(w, q, r)) ? Infinity : 1;
  };
  const path = roadPath({ q0: lo.q, q1: hi.q, r0: lo.r, r1: hi.r }, from, to, cost, ROAD_COST);
  if (path === null || path.length > hexDist(from, to) * MAX_DETOUR + 4) return null;
  return path.map(keyOf);
}
