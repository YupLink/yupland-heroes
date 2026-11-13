// Вход и ответ шага героя (move-step.ts). Отдельно — ради лимита строк шага.
import type { PortalPrice } from "@/lib/portal";
import type { FleeMove } from "./flee-move";
import type { ObjectInfo } from "./step-object";

/**
 * Куда шагаем. big — посадка только в БОЛЬШОЙ корабль: дальше маршрут идёт
 * океаном (клиент знает весь путь, сервер — один шаг). Малый туда не пройдёт,
 * и сажать в него значило бы списать энергию за путь, который оборвётся на
 * первой клетке океана (жалоба 03.10).
 */
export type StepTo = {
  q: number;
  r: number;
  big?: boolean;
  /**
   * Лестница (§8.121): шаг через одну клетку по прямой над непроходимой
   * (вода, преграда) на свободную; лестница из рюкзака этого героя
   * списывается тем же оператором, что шаг (move-step-sql).
   */
  ladder?: { heroId: string };
};

export type StepResult = {
  success: true;
  position: { q: number; r: number };
  moveCost: number;
  remainingEnergy: number;
  /** Шкала сытости после шага (lib/hero/satiety); героя нет — null. */
  satiety?: { now: number; max: number; hungry: boolean } | null;
  object: ObjectInfo | null;
  /** Что забрала дверь на этой клетке. Пусто — двери не было. */
  toll: PortalPrice[];
  /**
   * Кто разбежался от этого шага. Пусто почти всегда; когда не пусто —
   * клиент правит свою карту сразу, не дожидаясь живого потока, и не бьёт по
   * клетке, с которой цель уже ушла (flee-move).
   */
  fled: FleeMove[];
};
