// Что сделает нажатие на клетку: дойти, подойти и ударить, выстрелить,
// наложить заклинание. Одно правило и для подсказки под курсором, и для
// самого нажатия — что показали, то и произойдёт.
import { pathTo } from "@/lib/duel/path";
import { samePos, key } from "@/lib/duel/grid";
import { alive, bestStand, inShot, meleeStands, moveCells, shooter } from "@/lib/duel/options";
import type { Action, DuelState, Pos, SpellId, Unit } from "@/lib/duel/types";
import { R, xy, type XY } from "./layout";

export type Plan =
  | { t: "move"; to: Pos; path: Pos[] }
  | { t: "attack"; target: string; from: Pos; path: Pos[] }
  | { t: "shoot"; target: string }
  | { t: "cast"; spell: SpellId; target: string };

/**
 * С какой стороны подойти к цели: куда показывает палец от центра её клетки
 * (как в «Героях»). Палец по центру или та сторона закрыта — ближайшая.
 */
function standFor(st: DuelState, u: Unit, target: Unit, point: XY | null): Pos | null {
  const stands = meleeStands(st, u, target);
  if (stands.length === 0) return null;
  if (stands.some((p) => samePos(p, u.pos))) return u.pos;
  const c = xy(target.pos);
  const dx = point ? point.x - c.x : 0;
  const dy = point ? point.y - c.y : 0;
  const len = Math.hypot(dx, dy);
  if (len < R * 0.25) return bestStand(st, u, target);
  const aim = { x: c.x + (dx / len) * R * 1.73, y: c.y + (dy / len) * R * 1.73 };
  const d = (p: Pos) => {
    const s = xy(p);
    return (s.x - aim.x) ** 2 + (s.y - aim.y) ** 2;
  };
  return stands.reduce((best, p) => (d(p) < d(best) ? p : best));
}

export function planFor(
  st: DuelState,
  u: Unit,
  spell: SpellId | null,
  cell: Pos,
  point: XY | null,
): Plan | null {
  const there = st.units.find((x) => alive(x) && samePos(x.pos, cell));
  if (spell) {
    if (!there || there.side !== u.side) return null;
    return { t: "cast", spell, target: there.id };
  }
  if (there && there.side !== u.side) {
    if (shooter(u)) return inShot(u, there) ? { t: "shoot", target: there.id } : null;
    const from = standFor(st, u, there, point);
    return from ? { t: "attack", target: there.id, from, path: pathTo(st, u, from) } : null;
  }
  if (!there && moveCells(st, u).has(key(cell))) {
    return { t: "move", to: cell, path: pathTo(st, u, cell) };
  }
  return null;
}

export function planAction(p: Plan): Action {
  switch (p.t) {
    case "move":
      return { t: "move", to: p.to };
    case "attack":
      return { t: "attack", target: p.target, from: p.from };
    case "shoot":
      return { t: "shoot", target: p.target };
    case "cast":
      return { t: "cast", spell: p.spell, target: p.target };
  }
}
