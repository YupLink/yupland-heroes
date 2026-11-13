// Ход дуэли: расстановка, очередь раунда, действие бойца, конец боя. Чистые
// функции — те же правила потом сможет считать сервер для боя двух игроков.
import { key, onField, samePos } from "./grid";
import { HERO_MOVE, OFFER_GAP, SPELLS, hitDamage, spellCost } from "./rules";
import {
  alive,
  current,
  enemyOf,
  meleeStands,
  moveCells,
  pointBlank,
  unitById,
  inShot,
  shooter,
} from "./options";
import { COLS, type Action, type DuelState, type Side, type SideInput, type Unit } from "./types";

const MOB_ROWS = [1, 6, 3, 4];
const HERO_ROW = 4;
const OBSTACLES = 5;
/**
 * Зона расстановки: столько крайних столбцов своей стороны (Ярослав 08.11: «самый
 * старт — расставить воинов»). Камни — только между зонами.
 */
export const DEPLOY_COLS = 2;
/** Журнал держит последние записи: копируется на каждом ходе. */
const LOG_KEEP = 60;

/**
 * Копия состояния. Не structuredClone: его нет в старом вебвью Telegram на
 * Xiaomi (Chromium ~84), а состояние — простые данные без дат и функций.
 */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Детерминированный бросок 0..1 (mulberry32): тот же сид — тот же бой. */
function roll(st: DuelState): number {
  let t = (st.rng = (st.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Порядок раунда: кто дальше ходит — раньше; герой перед мобом; сторона A первой. */
function orderOf(units: readonly Unit[]): string[] {
  return units
    .filter(alive)
    .map((u, i) => ({ u, i }))
    .sort(
      (x, y) =>
        y.u.move - x.u.move ||
        Number(y.u.kind === "hero") - Number(x.u.kind === "hero") ||
        Number(x.u.side === "b") - Number(y.u.side === "b") ||
        x.i - y.i,
    )
    .map((x) => x.u.id);
}

function place(side: Side, inp: SideInput): Unit[] {
  const col = (c: number) => (side === "a" ? c : COLS - 1 - c);
  const base = { side, buffAtk: 0, buffDef: 0, defending: false };
  const hero: Unit = {
    ...inp.hero,
    ...base,
    move: inp.hero.move || HERO_MOVE,
    pos: { c: col(0), r: HERO_ROW },
  };
  // Одинаковых мобов можно несколько (владелец 09.11.2026): id — «сторона:шаблон:копия»,
  // по копии помнятся место в зоне и жизни после боя.
  const copies = new Map<string, number>();
  const mobs = inp.mobs.slice(0, MOB_ROWS.length).map((m, i) => {
    const copy = copies.get(m.id) ?? 0;
    copies.set(m.id, copy + 1);
    return { ...m, ...base, id: `${side}:${m.id}:${copy}`, pos: { c: col(1), r: MOB_ROWS[i] } };
  });
  return [{ ...hero, id: `${side}:hero` }, ...mobs];
}

export function createDuel(a: SideInput, b: SideInput, seed: number): DuelState {
  const units = [...place("a", a), ...place("b", b)];
  const st: DuelState = {
    units,
    kits: { a: clone(a.kit), b: clone(b.kit) },
    obstacles: [],
    round: 1,
    order: orderOf(units),
    turn: 0,
    rng: seed | 0,
    log: [{ k: "round", n: 1 }],
    winner: null,
    fled: null,
    spent: { a: { energy: 0, food: [] }, b: { energy: 0, food: [] } },
  };
  const taken = new Set(units.map((u) => key(u.pos)));
  for (let i = 0; i < OBSTACLES * 4 && st.obstacles.length < OBSTACLES; i++) {
    const p = {
      c: DEPLOY_COLS + 1 + Math.floor(roll(st) * (COLS - 2 * (DEPLOY_COLS + 1))),
      r: Math.floor(roll(st) * 8),
    };
    if (!taken.has(key(p))) {
      taken.add(key(p));
      st.obstacles.push(p);
    }
  }
  // Сторона без живых бойцов (голодный герой без мобов) проигрывает сразу.
  settle(st);
  return st;
}

/** Сколько ещё ходов стороне ждать, чтобы снова предложить ничью/сдаться (0 — можно). */
export function offerWait(st: DuelState, side: Side): number {
  const moves = st.moves ?? 0;
  const last = st.offerAt?.[side] ?? 0;
  return Math.max(0, OFFER_GAP - (moves - last));
}

/** Клетка в зоне расстановки стороны. */
export const inDeployZone = (side: Side, c: number): boolean =>
  side === "a" ? c < DEPLOY_COLS : c >= COLS - DEPLOY_COLS;

/** Бой ещё не начался: ни одного хода (в журнале только «раунд 1»). */
export const notStarted = (st: DuelState): boolean =>
  !st.winner && !st.draw && st.round === 1 && st.turn === 0 && st.log.every((e) => e.k === "round");

/**
 * Расстановка до боя: переставить своего бойца на клетку своей зоны. Клетка
 * занята своим — меняются местами; врагом или камнем — отказ.
 */
export function redeploy(prev: DuelState, unitId: string, to: { c: number; r: number }): DuelState {
  if (!notStarted(prev)) throw new Error("duel.started");
  const st = clone(prev);
  const u = st.units.find((x) => x.id === unitId);
  if (!u || !alive(u) || !onField(to) || !inDeployZone(u.side, to.c)) {
    throw new Error("duel.bad_move");
  }
  if (st.obstacles.some((p) => samePos(p, to))) throw new Error("duel.bad_move");
  const other = st.units.find((x) => x.id !== u.id && alive(x) && samePos(x.pos, to));
  if (other && other.side !== u.side) throw new Error("duel.bad_move");
  if (other) other.pos = u.pos;
  u.pos = to;
  return st;
}

function settle(st: DuelState): void {
  for (const side of ["a", "b"] as const) {
    if (!st.units.some((x) => x.side === side && alive(x))) st.winner = enemyOf(side);
  }
}

function hit(st: DuelState, u: Unit, t: Unit, shot: boolean): void {
  const dmg = hitDamage(u, t, roll(st), shot && pointBlank(st, u));
  t.hp = Math.max(0, t.hp - dmg);
  st.log.push({ k: "hit", a: u.name, b: t.name, dmg, shot, killed: t.hp === 0 });
}

function enemyTarget(st: DuelState, u: Unit, id: string): Unit {
  const t = unitById(st, id);
  if (!t || !alive(t) || t.side === u.side) throw new Error("duel.bad_target");
  return t;
}

/** Сделать ход бойца, чей сейчас ход. Возвращает новое состояние; неверный ход — ошибка. */
export function act(prev: DuelState, a: Action): DuelState {
  const st = clone(prev);
  const u = current(st);
  if (!u) throw new Error("duel.over");
  // Предложение ничьей / сдаться — не ход: стойка и очередь остаются как были.
  if (a.t === "offer") {
    if (offerWait(st, u.side) > 0) throw new Error("duel.offer_wait");
    st.offerAt = { ...st.offerAt, [u.side]: st.moves ?? 0 };
    st.log.push({ k: "offer", side: u.side, what: a.what, ok: a.accept });
    if (a.accept && a.what === "draw") st.draw = true;
    if (a.accept && a.what === "surrender") {
      st.winner = u.side;
      st.conceded = enemyOf(u.side);
    }
    if (st.log.length > LOG_KEEP) st.log = st.log.slice(-LOG_KEEP);
    return st;
  }
  u.defending = false;
  const kit = st.kits[u.side];
  const had = { atk: u.buffAtk, def: u.buffDef };
  switch (a.t) {
    case "move": {
      if (!onField(a.to) || !moveCells(st, u).has(key(a.to))) throw new Error("duel.bad_move");
      u.pos = a.to;
      st.log.push({ k: "move", a: u.name });
      break;
    }
    case "attack": {
      const t = enemyTarget(st, u, a.target);
      if (!meleeStands(st, u, t).some((p) => samePos(p, a.from))) throw new Error("duel.bad_move");
      u.pos = a.from;
      hit(st, u, t, false);
      break;
    }
    case "shoot": {
      if (!shooter(u)) throw new Error("duel.no_shot");
      const t = enemyTarget(st, u, a.target);
      if (!inShot(u, t)) throw new Error("duel.far");
      hit(st, u, t, true);
      break;
    }
    case "defend":
      u.defending = true;
      st.log.push({ k: "defend", a: u.name });
      break;
    case "cast": {
      const t = unitById(st, a.target);
      if (u.kind !== "hero" || !t || !alive(t) || t.side !== u.side)
        throw new Error("duel.bad_target");
      const cost = spellCost(a.spell, kit.int);
      if (kit.energy < cost) throw new Error("duel.no_energy");
      const sp = SPELLS[a.spell];
      kit.energy -= cost;
      st.spent[u.side].energy += cost;
      if (a.spell === "atk") t.buffAtk = sp.rounds;
      else t.buffDef = sp.rounds;
      st.log.push({ k: "spell", a: u.name, b: t.name, spell: a.spell, value: sp.pct });
      break;
    }
    case "eat": {
      const food = kit.food[a.slot];
      if (u.kind !== "hero" || !food) throw new Error("duel.no_food");
      if (u.hp >= u.maxHp) throw new Error("duel.full");
      const value = Math.min(u.maxHp - u.hp, food.value);
      u.hp += value;
      kit.food[a.slot] = null;
      st.spent[u.side].food.push(food.name);
      st.log.push({ k: "eat", a: u.name, food: food.name, value });
      break;
    }
    case "flee":
      st.fled = u.side;
      st.winner = enemyOf(u.side);
      st.log.push({ k: "flee", side: u.side });
      return st;
  }
  // Заклинание держится столько СВОИХ ходов бойца, сколько сказано: счёт — в
  // конце его хода (наложенное на себя в этот же ход не считается).
  if (u.buffAtk > 0 && u.buffAtk === had.atk) u.buffAtk -= 1;
  if (u.buffDef > 0 && u.buffDef === had.def) u.buffDef -= 1;
  if (st.log.length > LOG_KEEP) st.log = st.log.slice(-LOG_KEEP);
  st.moves = (st.moves ?? 0) + 1;
  settle(st);
  if (!st.winner) advance(st);
  return st;
}

function advance(st: DuelState): void {
  do st.turn += 1;
  while (st.turn < st.order.length && !alive(unitById(st, st.order[st.turn]) as Unit));
  if (st.turn < st.order.length) return;
  st.round += 1;
  st.order = orderOf(st.units);
  st.turn = 0;
  st.log.push({ k: "round", n: st.round });
}
