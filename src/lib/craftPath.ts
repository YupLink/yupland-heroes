// Зеркало серверных CRAFT_RULES (src/server/api/chips-craft.ts) для показа пути
// прокачки фишки в UI. Держать синхронно с CRAFT_RULES!
//   chips          = сколько фишек всего в шаге (база + жертвы)
//   identical      = нужны фишки того же вида (true) или любые (false)
//   cost           = СТАНДАРТНАЯ цена шага в золоте (lib/craftGold); на экране —
//                    по текущей цене: goldAtMultiplier(cost, множитель с сервера)
//   sacrificeLevel = уровень жертв, если он НИЖЕ базы (верхние 2 апгрейда,
//                    как в CapsGame). Отсутствует → жертвы уровня базы.
import { CRAFT_GOLD_STD } from "@/lib/craftGold";

export type CraftStep = {
  from: number;
  to: number;
  chips: number;
  identical: boolean;
  cost: number;
  sacrificeLevel?: number;
};

export const CRAFT_PATH: CraftStep[] = [
  { from: 1, to: 1.5, chips: 2, identical: true, cost: CRAFT_GOLD_STD["1"] },
  { from: 1.5, to: 2, chips: 3, identical: false, cost: CRAFT_GOLD_STD["1.5"] },
  { from: 2, to: 2.5, chips: 2, identical: true, cost: CRAFT_GOLD_STD["2"] },
  { from: 2.5, to: 3, chips: 3, identical: false, cost: CRAFT_GOLD_STD["2.5"] },
  { from: 3, to: 3.5, chips: 3, identical: true, cost: CRAFT_GOLD_STD["3"] },
  { from: 3.5, to: 4, chips: 2, identical: false, cost: CRAFT_GOLD_STD["3.5"] },
  // Верхние 2 апгрейда: жертвы НИЖНЕГО уровня (как в CapsGame).
  { from: 4, to: 4.5, chips: 2, identical: false, cost: CRAFT_GOLD_STD["4"], sacrificeLevel: 3.5 },
  { from: 4.5, to: 5, chips: 3, identical: true, cost: CRAFT_GOLD_STD["4.5"], sacrificeLevel: 2.5 },
];

// Кумулятивно: сколько фишек 1★ и золота по стандарту нужно, чтобы собрать
// ОДИН экземпляр уровня из фишек 1★. Верхние 2 апгрейда берут жертвы нижнего
// уровня, поэтому дерево дешевле classic same-level. T(L') = chips×T(L)+step,
// на топ-2 — base + N×жертва_нижнего_уровня. По текущей цене — craftGoldTotal.
//   4.5★: 324 фишки 1★, 9 039 золота   5★: 348 фишек 1★, 11 088 золота
export const CRAFT_TOTALS: Record<string, { lvl1: number; gold: number }> = {
  "1.5": { lvl1: 2, gold: 9 },
  "2": { lvl1: 6, gold: 48 },
  "2.5": { lvl1: 12, gold: 180 },
  "3": { lvl1: 36, gold: 705 },
  "3.5": { lvl1: 108, gold: 2448 },
  "4": { lvl1: 216, gold: 5532 },
  "4.5": { lvl1: 324, gold: 9039 },
  "5": { lvl1: 348, gold: 11088 },
};

/** Шаги прокачки от текущего уровня до 5★ (только оставшиеся). */
export function craftPathFrom(level: number): CraftStep[] {
  return CRAFT_PATH.filter((s) => s.from >= level - 0.001);
}
