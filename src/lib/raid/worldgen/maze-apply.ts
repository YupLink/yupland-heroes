// Лабиринт на участке: для каждой ячейки, что задевает участок, — проход ко
// всему (maze-fix) по клеткам с правками сети. Ответ — какой декор снять
// (null) и где засадить тупиковый карман (id декора-стены по весам земли:
// проходимый куст карман не закроет).
import { keyOf, parseKey } from "@/lib/raid/zonegen/town/hex";
import { isWaterId, type World } from "@/lib/raid/worldgen/field";
import { inBounds, type Bounds, type Cell } from "@/lib/raid/worldgen/geo";
import {
  isCorridor,
  mazeAttached,
  mazeCells,
  mazeIdsOf,
  mazeRadius,
} from "@/lib/raid/worldgen/maze";
import { fixMaze, type FixInfo } from "@/lib/raid/worldgen/maze-fix";
import { cellRoll, pickWeighted } from "@/lib/raid/worldgen/rand";
import type { WorldCell } from "@/lib/raid/worldgen/spec";

/** Сколько клеток вокруг участка нужно знать: ячейки, что его задевают, и тропа их соседей. */
/** Декор-стены земли с весами: проходимый (walk) засадке не годится. */
function wallsOf(w: World, terrainId: string): { ids: string[]; weights: number[] } {
  const plan = w.spec.decor[terrainId];
  const ids: string[] = [];
  const weights: number[] = [];
  plan?.ids.forEach((id, i) => {
    if (w.walk.has(id)) return;
    ids.push(id);
    weights.push(plan.w[i] ?? 0);
  });
  return { ids, weights };
}

export const mazeMargin = (w: World): number => 2 * mazeRadius(w) + 1;

export function mazeDecor(
  w: World,
  area: readonly Cell[],
  cellOf: (q: number, r: number) => WorldCell,
  bounds: Bounds,
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const inside = (c: Cell) => inBounds(bounds, c.q, c.r);
  for (const m of mazeIdsOf(w, area)) {
    const cells = mazeCells(w, m).filter(inside);
    const own = new Set(cells.map(keyOf));
    const keys = [...cells, ...mazeAttached(w, cells, m).filter(inside)].map(keyOf);
    const info = (k: string): FixInfo => {
      const c = parseKey(k);
      const cell = cellOf(c.q, c.r);
      const land = !isWaterId(w, cell.terrainId);
      const wall = cell.decorationId !== null && !w.walk.has(cell.decorationId);
      const mine = own.has(k);
      const walls = wallsOf(w, cell.terrainId);
      const free = cell.objectId === null && cell.buildingId === null && cell.roadId === null;
      return {
        land,
        passable: land && !wall,
        carvable: mine && land && wall,
        fillable: mine && land && !wall && free && walls.ids.length > 0 && !isCorridor(w, c.q, c.r),
      };
    };
    const fix = fixMaze(keys, info);
    for (const k of fix.carve) out.set(k, null);
    for (const k of fix.fill) {
      const c = parseKey(k);
      const walls = wallsOf(w, cellOf(c.q, c.r).terrainId);
      out.set(k, pickWeighted(walls.ids, walls.weights, cellRoll(w.seeds.fill, c.q, c.r)));
    }
  }
  return out;
}
