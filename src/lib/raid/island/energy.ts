// Энергия на острове новичка — в 10 раз дешевле, чем в мире, на все действия
// (владелец, 21.10.2026: «сделай действия в 10 раз дешевле, чем оригинал»; до
// того, 20.10, — вдвое). Один множитель на сервер и клиент: показанная цена
// совпадает со списанной. В мире множитель 1 — числа ровно прежние.
import { isIslandMapId } from "./ids";

export const ISLAND_ENERGY_MULT = 0.1;

/** Множитель трат энергии на карте: остров — 0,1, мир — 1. */
export const energyMultOf = (mapId: string | null | undefined): number =>
  isIslandMapId(mapId) ? ISLAND_ENERGY_MULT : 1;

/**
 * Цена × множитель, до сотых (как энергия в базе). Бесплатное остаётся
 * бесплатным, платное — не дешевле 0,01. При множителе 1 — цена как есть.
 */
export function scaleEnergy(cost: number, mult = 1): number {
  if (mult === 1 || !(cost > 0)) return cost;
  return Math.max(0.01, Math.round(cost * mult * 100) / 100);
}
