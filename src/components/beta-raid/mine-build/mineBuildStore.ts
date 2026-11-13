// Режим стройки шахты и мой чертёж — мимо React-состояния экрана, как полосы
// шахт (mineLifeStore): кадр карты берёт их прямо отсюда и перерисовывается по
// подписке (useMapRenderer), кнопки ✓/✗ и окно чертежа читают через
// useSyncExternalStore. Экран рейда от движения призрака не пересобирается.
//
// Ход режима:
//  · «Поставить» в рюкзаке → requestMineBuild. Карта открыта — режим сразу;
//    нет (рюкзак открыт с другой вкладки) — просьба ждёт карту до 10 минут;
//  · aimMineBuild — клетка героя: круг ещё не пришёл, призрак уже стоит;
//  · setBuildCells — пришёл круг с сервера (зелёные/красные);
//  · moveMineGhost — палец или тап: призрак встаёт на клетку круга;
//  · exitMineBuild — ✗ или чертёж поставлен.
import type { PlaceableBlueprint } from "@/lib/minePlacement";
import {
  candidateAt,
  firstGhost,
  snapToDisk,
  type MineCandidate,
  type MinePlanView,
} from "@/lib/mineBuild";

type Hex = { q: number; r: number };

export type MineBuild = {
  stackKey: string;
  kind: PlaceableBlueprint;
  /** Клетка героя, вокруг которой круг; null — герой ещё не известен. */
  center: Hex | null;
  /** Круг с сервера; null — ещё не пришёл (призрак без цвета). */
  cells: MineCandidate[] | null;
  ghost: Hex | null;
};

/** Ключ запроса моего чертежа; префикс «beta-raid» — общий сброс при смене этажа. */
export const MINE_PLAN_KEY = ["beta-raid-mine-plan"] as const;
/** Чертёж на этой карте (ключ с картой: чертёж с другого этажа сюда не попадёт). */
export const minePlanKey = (mapId: string | null) => [...MINE_PLAN_KEY, mapId] as const;

/** Сколько ждёт просьба «Поставить», пока игрок не откроет карту. */
const PENDING_MS = 10 * 60_000;

let build: MineBuild | null = null;
let plan: MinePlanView | null = null;
/** Карта, открытая сейчас (useMineBuild): чертёж другой карты не рисуем и не тапаем. */
let mapNow: string | null = null;
let pending: { stackKey: string; kind: PlaceableBlueprint; at: number } | null = null;
let consumers = 0;
/** Игрок уже двигал призрак: пришедший круг его не переставляет. */
let touched = false;
const listeners = new Set<() => void>();
const planned = new Set<(p: MinePlanView) => void>();

const emit = () => {
  for (const fn of listeners) fn();
};
const same = (a: Hex | null, b: Hex | null) => a?.q === b?.q && a?.r === b?.r;

export const getMineBuild = (): MineBuild | null => build;
export const getMinePlan = (): MinePlanView | null => plan;
/** Мой чертёж, если он на открытой карте. */
export const planOnMap = (): MinePlanView | null => (plan && plan.mapId === mapNow ? plan : null);

export function setMineBuildMap(mapId: string | null): void {
  if (mapNow === mapId) return;
  mapNow = mapId;
  emit();
}

/** Клетка под призраком: зелёная, красная или null — круг не пришёл. */
export const ghostCandidate = (): MineCandidate | null =>
  build ? candidateAt(build.cells, build.ghost) : null;

export function subscribeMineBuild(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Режим стройки только что включился (не было → есть): окна героя с рюкзаком
 * (HeroQuickModal, окно замка) закрываются, откуда бы их ни открыли.
 */
export function onMineBuildStart(fn: () => void): () => void {
  let was = !!build;
  return subscribeMineBuild(() => {
    const now = !!build;
    if (now && !was) fn();
    was = now;
  });
}

/** Карта открыта и ведёт режим (useMineBuild); вернёт «отцепиться». */
export function attachMineBuild(): () => void {
  consumers++;
  const p = pending;
  pending = null;
  if (p && Date.now() - p.at < PENDING_MS) startMineBuild(p.stackKey, p.kind);
  return () => {
    consumers = Math.max(0, consumers - 1);
    if (consumers === 0) exitMineBuild();
  };
}

export function startMineBuild(stackKey: string, kind: PlaceableBlueprint): void {
  if (build?.stackKey === stackKey) return; // уже в режиме с этой заготовкой
  build = { stackKey, kind, center: null, cells: null, ghost: null };
  touched = false;
  emit();
}

/** «Поставить» из рюкзака. false — карты нет, режим включится, когда её откроют. */
export function requestMineBuild(stackKey: string, kind: PlaceableBlueprint): boolean {
  if (consumers > 0) {
    startMineBuild(stackKey, kind);
    return true;
  }
  pending = { stackKey, kind, at: Date.now() };
  return false;
}

export function exitMineBuild(): void {
  if (!build) return;
  build = null;
  emit();
}

/** Клетка героя: сменилась — круг заново, призрак остаётся в новом круге. */
export function aimMineBuild(center: Hex): void {
  if (!build || same(build.center, center)) return;
  const ghost = build.ghost
    ? snapToDisk(center, build.ghost.q, build.ghost.r)
    : firstGhost(center, null);
  build = { ...build, center, cells: null, ghost };
  emit();
}

/**
 * Круг с сервера для клетки героя center. false — ответ про другую клетку
 * (сервер ещё не знал о шаге): не применён, круг надо спросить заново.
 */
export function setBuildCells(center: Hex, cells: MineCandidate[]): boolean {
  if (!build) return true;
  if (build.center && !same(build.center, center)) return false;
  const ghost = touched && build.ghost ? build.ghost : firstGhost(center, cells);
  build = { ...build, center, cells, ghost };
  emit();
  return true;
}

/** Призрак на клетку (q, r); за кругом — на ближайшую клетку края. */
export function moveMineGhost(q: number, r: number): void {
  if (!build?.center) return;
  const ghost = snapToDisk(build.center, q, r);
  touched = true;
  if (same(ghost, build.ghost)) return;
  build = { ...build, ghost };
  emit();
}

/** Мой чертёж (запрос getMyMinePlan или ответ «✓»). */
export function setMinePlan(next: MinePlanView | null): void {
  const a = plan;
  const kept =
    !!a && !!next && same(a, next) && a.mapId === next.mapId && a.stackKey === next.stackKey;
  if (a === next || kept) return;
  plan = next;
  emit();
}

/** «✓» положил чертёж: экран сразу ведёт к нему (useMineBuild). */
export function notePlanCreated(p: MinePlanView): void {
  setMinePlan(p);
  for (const fn of planned) fn(p);
}

export function subscribePlanCreated(fn: (p: MinePlanView) => void): () => void {
  planned.add(fn);
  return () => {
    planned.delete(fn);
  };
}

/** Кнопки ✓/✗ — их ставит на место кадр карты (placeMineBuildUi). */
let uiEl: HTMLElement | null = null;
export const getMineBuildEl = (): HTMLElement | null => uiEl;
export function setMineBuildEl(el: HTMLElement | null): void {
  if (uiEl === el) return;
  uiEl = el;
  emit();
}
