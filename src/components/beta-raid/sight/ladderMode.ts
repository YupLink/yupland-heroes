// Режим «Лестница» (§8.121): игрок нажал «Перелезть» в рюкзаке — карта ждёт
// тап по клетке за препятствием. Общий стор без React-контекста: рюкзак живёт
// в окнах поверх карты, слой и тап — на самой карте; кадр карты
// перерисовывается по подписке (useRedrawOnStores).
import { useSyncExternalStore } from "react";

export type Hex = { q: number; r: number };

let on = false;
let targets: Hex[] = [];
/** Сколько карт сейчас ведут лестницу (useLadder): без карты режим не включаем. */
let maps = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** false — карты нет (рюкзак открыт вне рейда): перелезать негде. */
export function startLadderMode(): boolean {
  if (maps === 0) return false;
  on = true;
  emit();
  return true;
}

/** Карта открыта и ведёт лестницу; вернёт «отцепиться» (режим гаснет с картой). */
export function attachLadderMap(): () => void {
  maps++;
  return () => {
    maps = Math.max(0, maps - 1);
    if (maps === 0) stopLadderMode();
  };
}

export function stopLadderMode(): void {
  if (!on && targets.length === 0) return;
  on = false;
  targets = [];
  emit();
}

/** Куда можно перелезть сейчас — для подсветки (drawLadderTargets). */
export function setLadderTargets(next: Hex[]): void {
  targets = next;
  emit();
}

export const ladderModeOn = (): boolean => on;
export const ladderTargetsNow = (): readonly Hex[] => (on ? targets : []);

export function subscribeLadder(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Режим только что включили: окна героя с рюкзаком закрываются (как у руки). */
export function onLadderStart(fn: () => void): () => void {
  let was = on;
  return subscribeLadder(() => {
    if (on && !was) fn();
    was = on;
  });
}

export function useLadderMode(): boolean {
  return useSyncExternalStore(
    subscribeLadder,
    () => on,
    () => false,
  );
}
