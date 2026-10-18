// Проход ко всему внутри ячейки лабиринта.
//
// Граф ячейки — её клетки суши и тропа соседей с меньшим номером, что к ней
// примыкает (mazeAttached). Для каждого куска суши в этом графе (суша связана
// без оглядки на декор) все проходимые клетки должны стать одним целым:
//  • тупиковый карман из 1–2 свободных клеток, где нет ни объекта, ни дома, ни
//    дороги, ни тропы, засаживается декором — лабиринт остаётся густым;
//  • остальные куски соединяются кратчайшим прорубом: 0-1 поиск от главного
//    куска, шаг по свободной клетке — 0, сквозь декор-стену — 1; декор на пути
//    снимается. Рубим только клетки самой ячейки — тропа соседа и так свободна.
// Тропы соседних ячеек смыкаются, поэтому из любой проходимой клетки суши можно
// дойти до любой другой на том же куске суши. Объект (босс, сундук) держит
// клетку, пока жив, — его побеждают, это не стена; дом проходим.
//
// Порядок обхода — по ключам клеток, соседи — в порядке DIRS: ответ зависит
// только от ячейки.
import { DIRS, keyOf, parseKey } from "@/lib/raid/zonegen/town/hex";

/** Клетка глазами прохода. */
export type FixInfo = {
  land: boolean;
  /** Пройти можно (нет декора-стены). */
  passable: boolean;
  /** Декор-стену можно срубить (клетка своей ячейки). */
  carvable: boolean;
  /** Клетку можно засадить декором (своя, свободная, без объекта, дома, дороги, тропы). */
  fillable: boolean;
};

export type FixResult = { carve: string[]; fill: string[] };

/** Самый большой тупиковый карман, который засаживается декором. */
export const POCKET_MAX = 2;

const byKey = (a: string, b: string) => {
  const x = parseKey(a);
  const y = parseKey(b);
  return x.r - y.r || x.q - y.q;
};

function components(keys: readonly string[], ok: (k: string) => boolean): string[][] {
  const set = new Set(keys.filter(ok));
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const start of [...set].sort(byKey)) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const k = queue.shift()!;
      comp.push(k);
      const c = parseKey(k);
      for (const [dq, dr] of DIRS) {
        const n = keyOf({ q: c.q + dq, r: c.r + dr });
        if (set.has(n) && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    out.push(comp.sort(byKey));
  }
  return out;
}

/** Срубить кратчайший проход от merged до ближайшего другого куска; вернуть его ключи. */
function carveTo(
  merged: Set<string>,
  inLand: Set<string>,
  open: (k: string) => boolean,
  carvable: (k: string) => boolean,
  isTarget: (k: string) => boolean,
): string[] | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const deque: string[] = [];
  for (const k of [...merged].sort(byKey)) {
    dist.set(k, 0);
    deque.push(k);
  }
  while (deque.length > 0) {
    const k = deque.shift()!;
    if (isTarget(k)) {
      const path: string[] = [];
      for (let at: string | undefined = k; at !== undefined && !merged.has(at); at = prev.get(at)) {
        path.push(at);
      }
      return path;
    }
    const c = parseKey(k);
    for (const [dq, dr] of DIRS) {
      const n = keyOf({ q: c.q + dq, r: c.r + dr });
      if (!inLand.has(n)) continue;
      const step = open(n) ? 0 : carvable(n) ? 1 : Infinity;
      const d = dist.get(k)! + step;
      if (!Number.isFinite(step) || d >= (dist.get(n) ?? Infinity)) continue;
      dist.set(n, d);
      prev.set(n, k);
      if (step === 0) deque.unshift(n);
      else deque.push(n);
    }
  }
  return null;
}

export function fixMaze(keys: readonly string[], info: (k: string) => FixInfo): FixResult {
  const carve = new Set<string>();
  const fill: string[] = [];
  const open = (k: string) => carve.has(k) || info(k).passable;
  for (const land of components(keys, (k) => info(k).land)) {
    const inLand = new Set(land);
    let comps = components(land, open);
    if (comps.length <= 1) continue;
    comps = comps.filter((comp) => {
      const pocket = comp.length <= POCKET_MAX && comp.every((k) => info(k).fillable);
      if (pocket) fill.push(...comp);
      return !pocket;
    });
    if (comps.length <= 1) continue;
    const compOf = new Map<string, number>();
    comps.forEach((comp, i) => comp.forEach((k) => compOf.set(k, i)));
    const merged = new Set(comps[0]);
    const done = new Set([0]);
    while (done.size < comps.length) {
      const isTarget = (k: string) => compOf.has(k) && !done.has(compOf.get(k)!);
      const path = carveTo(merged, inLand, open, (k) => info(k).carvable, isTarget);
      if (path === null) break;
      for (const k of path) {
        if (!info(k).passable) carve.add(k);
        merged.add(k);
      }
      const hit = compOf.get(path[0])!;
      done.add(hit);
      for (const k of comps[hit]) merged.add(k);
    }
  }
  return { carve: [...carve].sort(byKey), fill: fill.sort(byKey) };
}
