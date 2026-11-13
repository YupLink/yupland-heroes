// Вещь в руке (владелец, 26.10.2026: «герой ходит как и прежде — просто в руке земля или
// динамит, как с лопатой»): земля мира строителей, жила (29.10) или динамит в слоте
// «Главная рука»; гриб DARAI (31.10).
// Хранилище мимо React-состояния экрана, как стройка шахты: кадр карты рисует круг
// досягаемости и отмеченные клетки прямо отсюда (useMapRenderer — по подписке).
//
//  · «В руку» (слот руки, окна земли и динамита) → requestHand. Карта открыта — сразу;
//    нет — просьба ждёт карту до 10 минут;
//  · setHandCells — пришёл круг с сервера (абсолютные клетки);
//  · marks — отмеченные клетки (тап, кисть), spot — клетка обычного тапа, у плашки
//    маршрута которой есть кнопка руки; quick — «тап = разместить» (земля, жила);
//  · dropHand — убрали из руки, стопка кончилась или ушли с карты.
import { dynamiteKindOf } from "@/lib/dynamite";
import { isLandStackKey } from "@/lib/landPlace";
import { isVeinStackKey } from "@/lib/veinPlace";
import { mushroomKindOfStack } from "@/lib/mushroomKinds";

export type HandKind = "land" | "dynamite" | "vein" | "mushroom";
type Hex = { q: number; r: number };

/** Клетка круга: смещение от героя, можно ли, почему нет, цена и что заденет. */
export type HandCell = Hex & {
  dq: number;
  dr: number;
  ok: boolean;
  reason: string | null;
  /** Энергия: земля — 0 в пустоту, 5 поверх другой; динамит — цена броска; жила — 0; гриб — посадка. */
  cost: number;
  /** Что заденет динамит (шахта, цель, дерево/гора); у земли — null. */
  hit: string | null;
  /** Синий: здесь мой корабль — его взрыв не тронет (30.10.2026). */
  ownShip?: boolean;
};

export type Hand = {
  kind: HandKind;
  stackKey: string;
  /** Круг с сервера; null — ещё не пришёл (тап по карте пока обычный). */
  cells: HandCell[] | null;
  marks: Hex[];
  spot: Hex | null;
};

const PENDING_MS = 10 * 60_000;
const QUICK_KEY = "gd-hand-quick";

let hand: Hand | null = null;
let pending: { stackKey: string; at: number } | null = null;
let consumers = 0;
let quick = readQuick();
let mutedUntil = 0;
let runner: ((targets: Hex[]) => void) | null = null;
const listeners = new Set<() => void>();

function readQuick(): boolean {
  try {
    return globalThis.localStorage?.getItem(QUICK_KEY) === "1";
  } catch {
    return false;
  }
}

const emit = () => {
  for (const fn of listeners) fn();
};
const same = (a: Hex) => (b: Hex) => a.q === b.q && a.r === b.r;
const set = (next: Partial<Hand>) => {
  if (!hand) return;
  hand = { ...hand, ...next };
  emit();
};

/** Вид вещи по ключу стопки; не земля, не жила и не динамит — null (в руку не берётся). */
export function handKindOf(stackKey: string | null | undefined): HandKind | null {
  if (isLandStackKey(stackKey)) return "land";
  if (isVeinStackKey(stackKey)) return "vein";
  if (mushroomKindOfStack(stackKey)) return "mushroom";
  return dynamiteKindOf(stackKey) ? "dynamite" : null;
}

export const getHand = (): Hand | null => hand;
export const getQuick = (): boolean => quick;

export function subscribeHand(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Клетка круга под тапом; null — в руке ничего, круг не пришёл или клетка дальше. */
export function handAt(q: number, r: number): HandCell | null {
  return hand?.cells?.find((c) => c.q === q && c.r === r) ?? null;
}

export const isMarked = (q: number, r: number): boolean => !!hand?.marks.some(same({ q, r }));

/** Вещь только что взяли в руку: окна героя с рюкзаком закрываются (как у шахты). */
export function onHandStart(fn: () => void): () => void {
  let was = !!hand;
  return subscribeHand(() => {
    const now = !!hand;
    if (now && !was) fn();
    was = now;
  });
}

export function startHand(stackKey: string): void {
  const kind = handKindOf(stackKey);
  if (!kind || hand?.stackKey === stackKey) return;
  hand = { kind, stackKey, cells: null, marks: [], spot: null };
  emit();
}

/** «В руку». false — карты нет, вещь окажется в руке, когда её откроют. */
export function requestHand(stackKey: string): boolean {
  if (consumers > 0) {
    startHand(stackKey);
    return true;
  }
  pending = { stackKey, at: Date.now() };
  return false;
}

/** Карта открыта и ведёт руку (useHandItem); вернёт «отцепиться». */
export function attachHand(): () => void {
  consumers++;
  const p = pending;
  pending = null;
  if (p && Date.now() - p.at < PENDING_MS) startHand(p.stackKey);
  return () => {
    consumers = Math.max(0, consumers - 1);
    if (consumers === 0) dropHand();
  };
}

/** Круг пришёл: отметки, которые больше не годятся (положено, ушли), снимаются. */
export function setHandCells(stackKey: string, cells: HandCell[] | null): void {
  if (!hand || hand.stackKey !== stackKey || hand.cells === cells) return;
  const marks = cells
    ? hand.marks.filter((m) => cells.some((c) => c.ok && same(m)(c)))
    : hand.marks;
  set({ cells, marks: marks.length === hand.marks.length ? hand.marks : marks });
}

export function dropHand(): void {
  if (!hand) return;
  hand = null;
  emit();
}

/** Отметить клетку или снять отметку (тап). */
export function toggleMark(c: Hex): void {
  if (!hand) return;
  const has = hand.marks.some(same(c));
  set({ marks: has ? hand.marks.filter((m) => !same(c)(m)) : [...hand.marks, { q: c.q, r: c.r }] });
}

/** Отметить клетку (кисть ведёт по клеткам — снимать нечего). */
export function addMark(c: Hex): void {
  if (!hand || hand.marks.some(same(c))) return;
  set({ marks: [...hand.marks, { q: c.q, r: c.r }] });
}

export function clearMarks(): void {
  if (hand?.marks.length) set({ marks: [] });
}

/** Снять отметки с клеток, которые ушли в дело (остальные отмеченные остаются). */
export function unmark(cells: readonly Hex[]): void {
  if (!hand) return;
  const marks = hand.marks.filter((m) => !cells.some(same(m)));
  if (marks.length !== hand.marks.length) set({ marks });
}

export function setSpot(c: Hex | null): void {
  if (!hand || (c && hand.spot && same(c)(hand.spot)) || (!c && !hand.spot)) return;
  set({ spot: c ? { q: c.q, r: c.r } : null });
}

export function setQuick(on: boolean): void {
  quick = on;
  try {
    globalThis.localStorage?.setItem(QUICK_KEY, on ? "1" : "0");
  } catch {
    // приватный режим — переключатель живёт до перезагрузки
  }
  emit();
}

/** Кисть только что отпустили: щелчок, что придёт следом, — не тап по карте. */
export function muteTap(ms: number): void {
  mutedUntil = Date.now() + ms;
}
export const tapMuted = (): boolean => Date.now() < mutedUntil;

/** Кто кладёт и бросает (useHandItem); кнопки плашки и кисть зовут runHand. */
export function setHandRunner(fn: ((targets: Hex[]) => void) | null): void {
  runner = fn;
}
export function runHand(targets: Hex[]): void {
  if (targets.length) runner?.(targets);
}
