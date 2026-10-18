// Лабиринт мира (владелец, 06.10.2026: «как лабиринт, но ко всем областям, где
// есть участок земли, должен быть проход — чтобы и декор был, и везде пройти»).
//
// Суша разбита на ячейки: Вороной по сетке с дрожанием (свой сид), границы
// гуляют шумом. Тропа — клетка ячейки, у которой есть сосед из ячейки с
// БОЛЬШИМ номером: тропа идёт вдоль каждой общей границы по одну её сторону,
// и тропы соседних ячеек смыкаются по всей суше. Декора-стены на тропе нет.
// Внутри ячейки maze-fix соединяет с тропой каждую свободную клетку.
//
// Всё — от номера ячейки и клетки, без базы и без соседних чанков: тропа и
// проход в ячейке одинаковы, в каком бы чанке их ни считали.
import { fbm, hexToXY } from "@/lib/raid/zonegen/noise";
import { DIRS, disk, hashCell, keyOf } from "@/lib/raid/zonegen/town/hex";
import type { World } from "@/lib/raid/worldgen/field";
import { xyToHex, type Cell } from "@/lib/raid/worldgen/geo";

/** Сила изгиба границ ячеек: в среднем ±1 клетка, до ±5. */
const WARP = 10;
const WARP_SCALE = 7;

/** Номер ячейки: «i,j» её точки на сетке. */
export type MazeId = string;

const parts = (m: MazeId): [number, number] => {
  const at = m.indexOf(",");
  return [Number(m.slice(0, at)), Number(m.slice(at + 1))];
};

/** Порядок ячеек: по j, затем по i — тропа лежит у ячейки с меньшим номером. */
export function mazeCmp(a: MazeId, b: MazeId): number {
  const [ai, aj] = parts(a);
  const [bi, bj] = parts(b);
  return aj - bj || ai - bi;
}

function point(w: World, i: number, j: number): { x: number; y: number } {
  const h = hashCell(w.seeds.maze, i, j);
  const S = w.spec.maze;
  return { x: (i + (h & 0xffff) / 65536) * S, y: (j + (h >>> 16) / 65536) * S };
}

/** Ячейка лабиринта клетки (q, r). */
export function mazeAt(w: World, q: number, r: number): MazeId {
  const k = keyOf({ q, r });
  const hit = w.cache.maze.get(k);
  if (hit !== undefined) return hit;
  const { x, y } = hexToXY(q, r);
  const wx = x + (fbm(w.detail, x / WARP_SCALE + 11.3, y / WARP_SCALE - 4.1, 2) - 0.5) * WARP;
  const wy = y + (fbm(w.detail, x / WARP_SCALE - 7.9, y / WARP_SCALE + 6.7, 2) - 0.5) * WARP;
  const S = w.spec.maze;
  const [gx, gy] = [Math.floor(wx / S), Math.floor(wy / S)];
  let best = Infinity;
  let id = `${gx},${gy}`;
  for (let j = gy - 1; j <= gy + 1; j++) {
    for (let i = gx - 1; i <= gx + 1; i++) {
      const p = point(w, i, j);
      const d = (p.x - wx) ** 2 + (p.y - wy) ** 2;
      if (d < best) [best, id] = [d, `${i},${j}`];
    }
  }
  w.cache.maze.set(k, id);
  return id;
}

/** Тропа: у клетки есть сосед из ячейки с большим номером. */
export function isCorridor(w: World, q: number, r: number): boolean {
  const m = mazeAt(w, q, r);
  return DIRS.some(([dq, dr]) => mazeCmp(mazeAt(w, q + dq, r + dr), m) > 0);
}

/**
 * Как далеко клетка ячейки может быть от её точки. Своя клетка сетки всегда
 * среди кандидатов, а её точка не дальше √2·S от клетки — значит, и точка
 * победившей ячейки не дальше; плюс изгиб и разница гекса с плоскостью (×2/√3).
 */
export const mazeRadius = (w: World): number =>
  Math.ceil((Math.SQRT2 * w.spec.maze + WARP) * 1.16) + 2;

/** Клетки ячейки m: круг вокруг её точки, отобранный по номеру ячейки. */
export function mazeCells(w: World, m: MazeId): Cell[] {
  const [i, j] = parts(m);
  const p = point(w, i, j);
  return disk(xyToHex(p.x, p.y), mazeRadius(w)).filter((c) => mazeAt(w, c.q, c.r) === m);
}

/**
 * Соседние клетки ячейки m из ячеек с меньшим номером — это их тропа (у них
 * есть сосед в m, а номер m больше). Проход из m в соседа идёт через них.
 */
export function mazeAttached(w: World, cells: readonly Cell[], m: MazeId): Cell[] {
  const out = new Map<string, Cell>();
  for (const c of cells) {
    for (const [dq, dr] of DIRS) {
      const n = { q: c.q + dq, r: c.r + dr };
      if (mazeCmp(mazeAt(w, n.q, n.r), m) < 0) out.set(keyOf(n), n);
    }
  }
  return [...out.values()].sort((a, b) => a.r - b.r || a.q - b.q);
}

/** Ячейки, задевающие клетки cells, — по возрастанию номера. */
export function mazeIdsOf(w: World, cells: readonly Cell[]): MazeId[] {
  const ids = new Set<MazeId>();
  for (const c of cells) ids.add(mazeAt(w, c.q, c.r));
  return [...ids].sort(mazeCmp);
}
