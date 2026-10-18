// A* по гексам с ценой поворота — общий двигатель магистралей, улиц и перемычек.
//
// Спецификация (docs/town-generation-algorithm.json, шаг 6): цена шага зависит
// не только от клетки, но и от поворота (60° +0.3, 120° +0.8). Поэтому
// состояние поиска — (клетка, откуда вошли), а не одна клетка: иначе дешёвый
// путь с разворотом затирал бы дорогой прямой, и улицы ломались бы зигзагом.
// Разворот на 180° запрещён вовсе — дорога назад по себе не ходит.
//
// Ничьи решает порядок постановки в очередь (источники по порядку, соседи в
// фиксированном порядке DIRS), так что путь зависит только от входа.
import { DIRS, key, parseKey, turnSteps } from "@/lib/raid/zonegen/town/hex";

/** Шаг поиска: для вето ответвлений и «параллельных» улиц. */
export type PathStep = { from: string; to: string; dir: number; step: number };

export type PathQuery = {
  /** Стартовые клетки — цена 0 (вся сеть дорог, если улица ответвляется от любой). */
  sources: readonly string[];
  isGoal: (k: string) => boolean;
  /** Цена входа в клетку без поворота; Infinity — клетка закрыта. */
  enterCost: (k: string) => number;
  /** Дополнительное вето шага (угол ответвления, соседство с чужой улицей). */
  allow?: (s: PathStep) => boolean;
  /** Оценка остатка; обязана не превышать истинную цену (иначе путь не кратчайший). */
  heuristic?: (k: string) => number;
  /** Не длиннее стольких шагов от источника (улица ≤ 3/5, перемычка ≤ 4 клеток). */
  maxSteps?: number;
  /** Штраф поворота; по умолчанию включён. */
  turns?: boolean;
};

/** Штраф поворота по числу шагов в 60°: прямо 0, 60° +0.3, 120° +0.8 (шаг 6). */
export const TURN_COST: readonly number[] = [0, 0.3, 0.8];

type Node = {
  cell: string;
  q: number;
  r: number;
  dir: number;
  step: number;
  g: number;
  f: number;
  parent: number;
};

/** Куча по (f ↑, номер узла ↑): при равной цене раньше тот, кто раньше встал в очередь. */
function less(nodes: readonly Node[], a: number, b: number): boolean {
  const fa = nodes[a].f;
  const fb = nodes[b].f;
  return fa < fb || (fa === fb && a < b);
}

function push(heap: number[], nodes: readonly Node[], i: number): void {
  heap.push(i);
  let at = heap.length - 1;
  while (at > 0) {
    const up = (at - 1) >> 1;
    if (!less(nodes, heap[at], heap[up])) break;
    [heap[at], heap[up]] = [heap[up], heap[at]];
    at = up;
  }
}

function pop(heap: number[], nodes: readonly Node[]): number {
  const top = heap[0];
  const last = heap.pop() as number;
  if (heap.length === 0) return top;
  heap[0] = last;
  let at = 0;
  for (;;) {
    const l = at * 2 + 1;
    const r = l + 1;
    let m = at;
    if (l < heap.length && less(nodes, heap[l], heap[m])) m = l;
    if (r < heap.length && less(nodes, heap[r], heap[m])) m = r;
    if (m === at) break;
    [heap[at], heap[m]] = [heap[m], heap[at]];
    at = m;
  }
  return top;
}

/** Путь от источника к узлу; петля (клетка дважды) срезается до первого захода. */
function trace(nodes: readonly Node[], end: number): string[] {
  const rev: string[] = [];
  for (let i = end; i >= 0; i = nodes[i].parent) rev.push(nodes[i].cell);
  const out: string[] = [];
  const at = new Map<string, number>();
  for (const k of rev.reverse()) {
    const seen = at.get(k);
    if (seen !== undefined) {
      for (const x of out.splice(seen + 1)) at.delete(x);
      continue;
    }
    at.set(k, out.length);
    out.push(k);
  }
  return out;
}

/** Самый дешёвый путь от любого источника до любой цели (включая обе); null — пути нет. */
export function findPath(q: PathQuery): string[] | null {
  const turns = q.turns !== false;
  const h = q.heuristic ?? (() => 0);
  const limited = q.maxSteps !== undefined;
  const stateKey = (cell: string, dir: number, step: number) =>
    limited ? `${cell}|${dir}|${step}` : `${cell}|${dir}`;
  const nodes: Node[] = [];
  const best = new Map<string, number>();
  const heap: number[] = [];
  for (const s of q.sources) {
    const sk = stateKey(s, -1, 0);
    if (best.has(sk)) continue;
    const c = parseKey(s);
    best.set(sk, 0);
    nodes.push({ cell: s, q: c.q, r: c.r, dir: -1, step: 0, g: 0, f: h(s), parent: -1 });
    push(heap, nodes, nodes.length - 1);
  }
  const closed = new Set<string>();
  while (heap.length > 0) {
    const i = pop(heap, nodes);
    const n = nodes[i];
    const sk = stateKey(n.cell, n.dir, n.step);
    if (closed.has(sk)) continue;
    closed.add(sk);
    if (q.isGoal(n.cell)) return trace(nodes, i);
    if (limited && n.step >= (q.maxSteps as number)) continue;
    for (let d = 0; d < DIRS.length; d++) {
      const turn = n.dir < 0 ? 0 : turnSteps(n.dir, d);
      if (turn === 3) continue;
      const to = key(n.q + DIRS[d][0], n.r + DIRS[d][1]);
      const base = q.enterCost(to);
      if (!Number.isFinite(base)) continue;
      if (q.allow !== undefined && !q.allow({ from: n.cell, to, dir: d, step: n.step + 1 }))
        continue;
      const g = n.g + base + (turns ? TURN_COST[turn] : 0);
      const tk = stateKey(to, d, n.step + 1);
      if (g >= (best.get(tk) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(tk, g);
      const tq = n.q + DIRS[d][0];
      const tr = n.r + DIRS[d][1];
      nodes.push({ cell: to, q: tq, r: tr, dir: d, step: n.step + 1, g, f: g + h(to), parent: i });
      push(heap, nodes, nodes.length - 1);
    }
  }
  return null;
}
