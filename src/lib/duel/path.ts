// Путь бойца по клеткам — чтобы на экране он шёл клетка за клеткой, а не
// перескакивал. Обход тот же, что у moveCells: камни и живые бойцы — стена.
import { key, neighbors, samePos } from "./grid";
import { blockedFor } from "./options";
import type { DuelState, Pos, Unit } from "./types";

/**
 * Кратчайший путь от клетки бойца до to: первая клетка — где стоит, последняя —
 * to. Стоит уже там — одна клетка. Пути нет (ход всё равно проверяет движок) —
 * старт и цель, то есть прямой шаг.
 */
export function pathTo(st: DuelState, u: Unit, to: Pos): Pos[] {
  if (samePos(u.pos, to)) return [u.pos];
  const blocked = blockedFor(st, u);
  const from = new Map<string, Pos | null>([[key(u.pos), null]]);
  let front = [u.pos];
  while (front.length > 0) {
    const next: Pos[] = [];
    for (const p of front) {
      for (const n of neighbors(p)) {
        const k = key(n);
        if (from.has(k) || blocked.has(k)) continue;
        from.set(k, p);
        if (samePos(n, to)) {
          const path: Pos[] = [n];
          for (let at = from.get(k); at; at = from.get(key(at))) path.unshift(at);
          return path;
        }
        next.push(n);
      }
    }
    front = next;
  }
  return [u.pos, to];
}
