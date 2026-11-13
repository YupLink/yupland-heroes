// Проход ко всему заданию: от старта до каждой цели должна быть дорога ногами.
//
// Лабиринт генератора и так соединяет сушу, но клетки задания поставлены
// поверх него: дуб или кристалл могли закрыть тропу. Здесь — проверка и
// проруб: путь от старта к соседу цели с наименьшим числом клеток декора,
// декор на нём снимается (декор задания — дубы и кристаллы — не трогаем).
import { DIRS, keyOf } from "@/lib/raid/zonegen/town/hex";
import type { Cell } from "@/lib/raid/worldgen/geo";
import type { WorldCell } from "@/lib/raid/worldgen/spec";

export type CarveInput = {
  cells: WorldCell[];
  water: ReadonlySet<string>;
  /** Декор, сквозь который ходят (meta.walkable). */
  walk: ReadonlySet<string>;
  start: Cell;
  targets: readonly Cell[];
  /** Клетки, декор которых снимать нельзя (дубы и кристаллы задания). */
  keep: ReadonlySet<string>;
};

const neighbors = (c: Cell): Cell[] => DIRS.map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }));

/** Сквозь шахту не пройти (§8.59, mine-cell-sql) — стена, как живой объект. */
export const isMineCell = (c: WorldCell): boolean => c.buildingConfig?.effect === "mine";

/** Сетка острова: клетка по ключу, суша ли, можно ли стоять. */
function grid(inp: Pick<CarveInput, "cells" | "water" | "walk">) {
  const at = new Map(inp.cells.map((c, i) => [keyOf(c), i]));
  const cell = (k: string) => {
    const i = at.get(k);
    return i === undefined ? null : inp.cells[i];
  };
  const land = (k: string) => at.has(k) && !inp.water.has(k);
  // Стоять можно: суша без живого объекта и без декора-стены; дом проходим,
  // шахта — нет.
  const open = (k: string) => {
    const c = cell(k);
    if (!c || !land(k) || c.objectId || isMineCell(c)) return false;
    return c.decorationId === null || inp.walk.has(c.decorationId);
  };
  return { at, cell, land, open };
}

/** Куда от клетки дойти ногами по открытым клеткам (сама клетка — тоже). */
export function reachFrom(
  inp: Pick<CarveInput, "cells" | "water" | "walk" | "start">,
): Set<string> {
  const { open } = grid(inp);
  const seen = new Set([keyOf(inp.start)]);
  const queue: Cell[] = [inp.start];
  while (queue.length > 0) {
    for (const n of neighbors(queue.pop() as Cell)) {
      if (seen.has(keyOf(n)) || !open(keyOf(n))) continue;
      seen.add(keyOf(n));
      queue.push(n);
    }
  }
  return seen;
}

/**
 * Пятачки суши, куда от старта не дойти (кругом декор), — соединить проходом,
 * как цели задания (владелец, 14.10: «по суше — до всех мест, куда только
 * можно»; было у 44 островов из 100). Пятачок, к которому прохода нет вовсе
 * (кругом вода и объекты), пропускаем. Возвращает, сколько клеток расчищено.
 */
export function connectPockets(inp: Omit<CarveInput, "targets">): number {
  const { open } = grid(inp);
  const skip = new Set<string>();
  let cleared = 0;
  // Предохранитель: пятачков на острове единицы, круг — один пятачок.
  for (let round = 0; round < 100; round++) {
    const reached = reachFrom(inp);
    const pocket = inp.cells.find((c) => {
      const k = keyOf(c);
      return open(k) && !reached.has(k) && !skip.has(k);
    });
    if (!pocket) return cleared;
    const n = carvePaths({ ...inp, targets: [pocket] });
    if (n === 0) for (const k of reachFrom({ ...inp, start: pocket })) skip.add(k);
    cleared += n;
  }
  return cleared;
}

/** Снимает мешающий декор на месте; возвращает, сколько клеток расчищено. */
export function carvePaths(inp: CarveInput): number {
  const { at, cell, land, open } = grid(inp);
  // Цена клетки при прорубе: открытая — 0, декор, который можно снять, — 1.
  const cost = (k: string): number | null => {
    if (open(k)) return 0;
    const c = cell(k);
    if (!c || !land(k) || c.objectId || isMineCell(c) || inp.keep.has(k)) return null;
    return 1;
  };

  let cleared = 0;
  for (const t of inp.targets) {
    const goals = new Set(neighbors(t).map(keyOf).filter(land));
    if (open(keyOf(t))) goals.add(keyOf(t));
    // 0-1 BFS от старта: кратчайший по числу снимаемых клеток путь.
    const dist = new Map<string, number>([[keyOf(inp.start), 0]]);
    const prev = new Map<string, string>();
    const deque: string[] = [keyOf(inp.start)];
    let found: string | null = null;
    while (deque.length > 0) {
      const k = deque.shift() as string;
      if (goals.has(k) && open(k)) {
        found = k;
        break;
      }
      const [q, r] = k.split(",").map(Number);
      for (const n of neighbors({ q, r })) {
        const nk = keyOf(n);
        const w = cost(nk);
        if (w === null) continue;
        const d = (dist.get(k) ?? 0) + w;
        if (d >= (dist.get(nk) ?? Infinity)) continue;
        dist.set(nk, d);
        prev.set(nk, k);
        if (w === 0) deque.unshift(nk);
        else deque.push(nk);
      }
    }
    if (found === null) {
      // Открытого соседа нет — берём ближайшего по цене и расчищаем его самого.
      let best: string | null = null;
      for (const g of goals) {
        if (dist.has(g) && (best === null || (dist.get(g) ?? 0) < (dist.get(best) ?? 0))) best = g;
      }
      found = best;
    }
    for (let k: string | undefined = found ?? undefined; k; k = prev.get(k)) {
      const i = at.get(k);
      if (i === undefined || open(k)) continue;
      inp.cells[i] = { ...inp.cells[i], decorationId: null, mode: "built" };
      cleared++;
    }
  }
  return cleared;
}
