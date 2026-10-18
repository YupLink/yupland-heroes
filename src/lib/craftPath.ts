// Зеркало серверных CRAFT_RULES (src/server/api/chips.ts) для показа пути
// прокачки фишки в UI. Держать синхронно с CRAFT_RULES!
//   chips          = сколько фишек всего в шаге (база + жертвы)
//   identical      = нужны фишки того же вида (true) или любые (false)
//   cost           = билеты за один шаг (НЕ менять — первоисточник)
//   sacrificeLevel = уровень жертв, если он НИЖЕ базы (верхние 2 апгрейда,
//                    как в CapsGame). Отсутствует → жертвы уровня базы.

export type CraftStep = {
  from: number;
  to: number;
  chips: number;
  identical: boolean;
  cost: number;
  sacrificeLevel?: number;
};

export const CRAFT_PATH: CraftStep[] = [
  { from: 1, to: 1.5, chips: 2, identical: true, cost: 0.03 },
  { from: 1.5, to: 2, chips: 3, identical: false, cost: 0.07 },
  { from: 2, to: 2.5, chips: 2, identical: true, cost: 0.28 },
  { from: 2.5, to: 3, chips: 3, identical: false, cost: 0.55 },
  { from: 3, to: 3.5, chips: 3, identical: true, cost: 1.11 },
  { from: 3.5, to: 4, chips: 2, identical: false, cost: 2.12 },
  // Верхние 2 апгрейда: жертвы НИЖНЕГО уровня (как в CapsGame). Билеты те же.
  { from: 4, to: 4.5, chips: 2, identical: false, cost: 3.53, sacrificeLevel: 3.5 },
  { from: 4.5, to: 5, chips: 3, identical: true, cost: 5.63, sacrificeLevel: 2.5 },
];

// Кумулятивно: сколько фишек 1★ и билетов нужно, чтобы собрать ОДИН
// экземпляр уровня из фишек 1★. Верхние 2 апгрейда берут жертвы нижнего
// уровня, поэтому дерево дешевле classic same-level. T(L') = chips×T(L)+step,
// на топ-2 — base + N×жертва_нижнего_уровня.
//   4.5★: 324 фишки 1★, 30.13 билета   5★: 348 фишек 1★, 36.96 билета
export const CRAFT_TOTALS: Record<string, { lvl1: number; tickets: number }> = {
  "1.5": { lvl1: 2, tickets: 0.03 },
  "2": { lvl1: 6, tickets: 0.16 },
  "2.5": { lvl1: 12, tickets: 0.6 },
  "3": { lvl1: 36, tickets: 2.35 },
  "3.5": { lvl1: 108, tickets: 8.16 },
  "4": { lvl1: 216, tickets: 18.44 },
  "4.5": { lvl1: 324, tickets: 30.13 },
  "5": { lvl1: 348, tickets: 36.96 },
};

/** Шаги прокачки от текущего уровня до 5★ (только оставшиеся). */
export function craftPathFrom(level: number): CraftStep[] {
  return CRAFT_PATH.filter((s) => s.from >= level - 0.001);
}
