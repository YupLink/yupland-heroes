// Путь тракта: A* по клеткам прямоугольного окна (q0…q1 × r0…r1).
//
// Улицам города нужен A* с ценой поворота и счётом шагов (zonegen/town/astar):
// у него состояние — (клетка, откуда вошли, шаг), и на окне между городами,
// где пути может не быть вовсе (озеро), он перебирает миллионы состояний —
// секунды на одну пару. Тракту хватает клетки: окно — плоские массивы, куча
// по номерам, ничьи — по номеру клетки, так что путь зависит только от входа.
// Прямизна — крошечной надбавкой к оценке остатка (тянет к цели напрямик).
import { DIRS } from "@/lib/raid/zonegen/town/hex";
import type { Cell } from "@/lib/raid/worldgen/geo";

export type Window = { q0: number; q1: number; r0: number; r1: number };

/** Надбавка к оценке: из двух равных путей берётся тот, что ближе к прямой. */
const STRAIGHT = 1.001;

const hexDist = (aq: number, ar: number, bq: number, br: number): number =>
  (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;

/**
 * Путь от from до to внутри окна или null. cost(q, r) — цена входа в клетку,
 * Infinity — нельзя; minCost — нижняя граница цены (для честной оценки).
 */
export function roadPath(
  win: Window,
  from: Cell,
  to: Cell,
  cost: (q: number, r: number) => number,
  minCost: number,
): Cell[] | null {
  const W = win.q1 - win.q0 + 1;
  const H = win.r1 - win.r0 + 1;
  const inWin = (q: number, r: number) => q >= win.q0 && q <= win.q1 && r >= win.r0 && r <= win.r1;
  if (!inWin(from.q, from.r) || !inWin(to.q, to.r)) return null;
  const idx = (q: number, r: number) => (q - win.q0) * H + (r - win.r0);
  const g = new Float64Array(W * H).fill(Infinity);
  const f = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const heap: number[] = [];
  const less = (a: number, b: number) => f[a] < f[b] || (f[a] === f[b] && a < b);
  const push = (i: number) => {
    heap.push(i);
    for (let at = heap.length - 1; at > 0; ) {
      const up = (at - 1) >> 1;
      if (!less(heap[at], heap[up])) break;
      [heap[at], heap[up]] = [heap[up], heap[at]];
      at = up;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let at = 0; ; ) {
        const [l, r] = [at * 2 + 1, at * 2 + 2];
        let m = at;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === at) break;
        [heap[at], heap[m]] = [heap[m], heap[at]];
        at = m;
      }
    }
    return top;
  };
  const start = idx(from.q, from.r);
  const goal = idx(to.q, to.r);
  g[start] = 0;
  f[start] = hexDist(from.q, from.r, to.q, to.r) * minCost * STRAIGHT;
  push(start);
  while (heap.length > 0) {
    const i = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === goal) break;
    const q = Math.floor(i / H) + win.q0;
    const r = (i % H) + win.r0;
    for (const [dq, dr] of DIRS) {
      const nq = q + dq;
      const nr = r + dr;
      if (!inWin(nq, nr)) continue;
      const j = idx(nq, nr);
      if (closed[j]) continue;
      const c = cost(nq, nr);
      if (!Number.isFinite(c)) continue;
      const ng = g[i] + c;
      if (ng >= g[j]) continue;
      g[j] = ng;
      prev[j] = i;
      f[j] = ng + hexDist(nq, nr, to.q, to.r) * minCost * STRAIGHT;
      push(j);
    }
  }
  if (!closed[goal]) return null;
  const path: Cell[] = [];
  for (let i = goal; i !== -1; i = prev[i])
    path.push({ q: Math.floor(i / H) + win.q0, r: (i % H) + win.r0 });
  return path.reverse();
}
