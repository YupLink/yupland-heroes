// Что может боец сейчас: куда дойти, кого ударить и откуда, стреляет ли в упор.
import { distance, key, neighbors, reachable, samePos } from "./grid";
import type { DuelState, Pos, Side, Unit } from "./types";

export const alive = (u: Unit): boolean => u.hp > 0;
export const enemyOf = (s: Side): Side => (s === "a" ? "b" : "a");

export function unitById(st: DuelState, id: string): Unit | null {
  return st.units.find((u) => u.id === id) ?? null;
}

/** Чей ход: живой боец по порядку раунда (бой окончен — никто). */
export function current(st: DuelState): Unit | null {
  if (st.winner || st.draw) return null;
  const id = st.order[st.turn];
  const u = id ? unitById(st, id) : null;
  return u && alive(u) ? u : null;
}

/** Занятые клетки: препятствия и живые бойцы, кроме самого бойца. */
export function blockedFor(st: DuelState, self: Unit): Set<string> {
  const out = new Set(st.obstacles.map(key));
  for (const u of st.units) if (alive(u) && u.id !== self.id) out.add(key(u.pos));
  return out;
}

/** Куда боец дойдёт в свой ход: «c,r» → шаги. */
export function moveCells(st: DuelState, u: Unit): Map<string, number> {
  return reachable(u.pos, u.move, blockedFor(st, u));
}

/** Откуда можно ударить цель вплотную: своя клетка (уже рядом) или достижимая соседняя. */
export function meleeStands(st: DuelState, u: Unit, target: Unit): Pos[] {
  if (distance(u.pos, target.pos) === 1) return [u.pos];
  const reach = moveCells(st, u);
  return neighbors(target.pos).filter((p) => reach.has(key(p)));
}

/** Стрелок: бьёт издали, на свою дальность (владелец 08.11.2026). */
export const shooter = (u: Unit): boolean => u.range >= 2;

/** Достаёт ли стрелок цель со своей клетки. */
export const inShot = (u: Unit, t: Unit): boolean =>
  shooter(u) && distance(u.pos, t.pos) <= u.range;

/** Рядом с бойцом стоит враг — стрелок бьёт вполсилы. */
export function pointBlank(st: DuelState, u: Unit): boolean {
  return st.units.some((e) => alive(e) && e.side !== u.side && distance(e.pos, u.pos) === 1);
}

export const enemies = (st: DuelState, u: Unit): Unit[] =>
  st.units.filter((e) => alive(e) && e.side !== u.side);

export const allies = (st: DuelState, side: Side): Unit[] =>
  st.units.filter((e) => alive(e) && e.side === side);

/** Лучшая клетка удара: ближняя к бойцу (меньше идти). */
export function bestStand(st: DuelState, u: Unit, target: Unit): Pos | null {
  const stands = meleeStands(st, u, target);
  if (stands.length === 0) return null;
  return stands.reduce((best, p) =>
    samePos(p, u.pos) || distance(u.pos, p) < distance(u.pos, best) ? p : best,
  );
}
