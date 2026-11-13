// Противник-компьютер для песочницы: простой и предсказуемый. Герой ест, когда
// сытость на исходе, усиливает сильнейшего; бойцы бьют героя
// врага, если дотянутся, иначе — слабейшего, иначе идут к ближнему.
import { distance, key, parseKey, reachable } from "./grid";
import { spellCost } from "./rules";
import {
  allies,
  bestStand,
  blockedFor,
  current,
  enemies,
  inShot,
  moveCells,
  shooter,
} from "./options";
import { COLS, ROWS } from "./types";
import type { Action, DuelState, OfferKind, Pos, Side, Unit } from "./types";

const share = (u: Unit) => u.hp / Math.max(1, u.maxHp);

function heroMove(st: DuelState, u: Unit): Action | null {
  const kit = st.kits[u.side];
  if (share(u) < 0.35) {
    const slot = kit.food.findIndex((f) => f !== null);
    if (slot >= 0) return { t: "eat", slot };
  }
  const mine = allies(st, u.side).filter((x) => x.kind === "mob");
  const strong = mine.filter((x) => x.buffAtk === 0).sort((x, y) => y.dmg[1] - x.dmg[1])[0];
  if (strong && kit.energy >= spellCost("atk", kit.int))
    return { t: "cast", spell: "atk", target: strong.id };
  return null;
}

/** Стрелку никого не достать — встать туда, откуда достанет, и подальше от врагов. */
function shotSpot(st: DuelState, u: Unit, foes: Unit[]): Pos | null {
  let best: Pos | null = null;
  let bestD = -1;
  for (const k of moveCells(st, u).keys()) {
    const p = parseKey(k);
    const near = Math.min(...foes.map((f) => distance(p, f.pos)));
    if (near <= u.range && near > bestD) [best, bestD] = [p, near];
  }
  return best;
}

/** Цель удара: герой врага, иначе слабейший. */
const pick = (list: Unit[]): Unit | undefined =>
  list.find((x) => x.kind === "hero") ?? [...list].sort((x, y) => x.hp - y.hp)[0];

export function aiAction(st: DuelState): Action | null {
  const u = current(st);
  if (!u) return null;
  const foes = enemies(st, u);
  const inReach = foes.filter((t) => bestStand(st, u, t) !== null);
  // Герой бьёт сам, когда дотягивается (иначе с тысячами энергии он колдовал
  // бы весь бой из угла); голодный сперва ест в любом случае.
  if (u.kind === "hero") {
    const spell = heroMove(st, u);
    if (spell && (spell.t === "eat" || inReach.length === 0)) return spell;
  }
  if (shooter(u)) {
    const t = pick(foes.filter((f) => inShot(u, f)));
    if (t) return { t: "shoot", target: t.id };
    const spot = shotSpot(st, u, foes);
    if (spot) return { t: "move", to: spot };
  }
  const t = pick(inReach);
  if (t) return { t: "attack", target: t.id, from: bestStand(st, u, t) ?? u.pos };
  // Никого не достать — шаг к ближнему врагу ПО ПУТИ (в обход камней и своих),
  // а не по прямой: по прямой моб упирался в камень и вставал в защиту навсегда.
  const blocked = blockedFor(st, u);
  const reach = moveCells(st, u);
  let best: string | null = null;
  let bestD = Infinity;
  for (const foe of foes) {
    const path = reachable(foe.pos, COLS * ROWS, blocked);
    const here = path.get(key(u.pos)) ?? Infinity;
    for (const k of reach.keys()) {
      const d = path.get(k) ?? Infinity;
      if (d < here && d < bestD) [best, bestD] = [k, d];
    }
  }
  if (best) return { t: "move", to: parseKey(best) };
  // Пути нет вовсе — хотя бы ближе по прямой, иначе защита.
  const near = [...foes].sort((x, y) => distance(u.pos, x.pos) - distance(u.pos, y.pos))[0];
  let step: string | null = null;
  let stepD = near ? distance(u.pos, near.pos) : Infinity;
  for (const k of reach.keys()) {
    const d = near ? distance(parseKey(k), near.pos) : Infinity;
    if (d < stepD) [step, stepD] = [k, d];
  }
  return step ? { t: "move", to: parseKey(step) } : { t: "defend" };
}

/**
 * Сколько сил у стороны осталось: средняя доля жизней по всем её бойцам с начала боя
 * (павший — 0). Доля, а не сумма: моб на 10 млрд не перевешивает остальных.
 */
export function armyLeft(st: DuelState, side: Side): number {
  const mine = st.units.filter((u) => u.side === side);
  if (mine.length === 0) return 0;
  return mine.reduce((s, u) => s + (u.hp > 0 ? share(u) : 0), 0) / mine.length;
}

/** Явный перевес: на столько долей сил больше. */
export const OFFER_EDGE = 0.15;

/**
 * Компьютер отвечает на предложение (песочница; в бою двух игроков решает соперник).
 * Сдаётся — если у него меньше половины сил и меньше, чем у вас; ничья — если он
 * не выигрывает явно.
 */
export function acceptsOffer(st: DuelState, side: Side, what: OfferKind): boolean {
  const me = armyLeft(st, side);
  const them = armyLeft(st, side === "a" ? "b" : "a");
  if (what === "surrender") return me < 0.5 && me < them;
  return me <= them + OFFER_EDGE;
}
