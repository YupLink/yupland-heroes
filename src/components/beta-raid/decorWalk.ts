// «Срубить» в окне рубки издалека (владелец, 13.11.2026): герой сразу идёт к
// дереву и рубит — без второго «Срубить» на плашке маршрута. Тот же поход, что
// у кнопки плашки: approachCell с go (как лопата) → moveAlongPath, по приходу —
// useDecorInteract.arrive, как onDecor у useApproachDone.
//
// Сразу идём, только когда энергии хватает на дорогу И рубку (счёт стрелок
// плашки, pathReach). Иначе — как раньше: плашка маршрута (красная цена,
// «Идти» до последней зелёной стрелки); дверь на пути — тоже плашка (её плату
// подтверждают); пути нет — «Туда не пройти».
import type { PendingAction } from "./useBetaMovement";
import { pathReach } from "./pathReach";
import type { DoorTollMap } from "./pathTolls";
import type { Step } from "./routeSearch";

export { walkEnergy } from "./pathReach";
export type { Step };

/** useBetaMovement.approachCell: go — идти сразу; Promise — пошли (true — дошли). */
export type ApproachCell = (
  q: number,
  r: number,
  action?: PendingAction | null,
  failKey?: string,
  anySide?: boolean,
  go?: boolean,
) => Promise<boolean> | undefined;

/** Что нужно хуку рубки (useDecorInteract) от движения и экрана. */
export type DecorWalkOpts = {
  approachCell: ApproachCell;
  /** Маршрут подхода без похода (useBetaMovement.approachPath): цена дороги в окне. */
  approachPath: (q: number, r: number) => Step[] | null;
  /** Энергия героя и цены дверей — тот же счёт, что у плашки маршрута. */
  energy: number;
  tolls?: DoorTollMap;
};

/** Хватает ли энергии дойти по path и сделать дело ценой actionCost (уже с множителем). */
export function canWalkAndAct(
  path: ReadonlyArray<Step> | null | undefined,
  energy: number,
  actionCost: number,
  tolls?: DoorTollMap,
): boolean {
  if (!path || path.length === 0) return false;
  return pathReach(path, energy - actionCost, tolls) >= path.length;
}

/**
 * Пойти рубить декор (q, r). go — сразу в путь; дошли — arrive, оборвался путь
 * (отказ сервера, «стоп») — failed. Без go или когда approachCell показал
 * плашку — дело сделает её кнопка, как раньше.
 */
export function walkToDecor(
  o: {
    approachCell: ApproachCell;
    go: boolean;
    arrive: (q: number, r: number) => void;
    failed: () => void;
  },
  q: number,
  r: number,
  extraCost: number,
): void {
  const walk = o.approachCell(q, r, { kind: "decor", q, r, extraCost }, undefined, undefined, o.go);
  if (!o.go || !walk) return;
  void walk.then((ok) => (ok ? o.arrive(q, r) : o.failed()));
}
