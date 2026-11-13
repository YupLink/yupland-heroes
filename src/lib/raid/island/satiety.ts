// Сытость на острове новичка — в 10 раз медленнее, чем в мире (владелец,
// 21.10.2026: «расход сытости /10 от оригинальной во время нахождения на
// острове»): шаг, вода, бой, подбор золота, рубка и ловля руками. Еда
// наполняет как везде. Один множитель на сервер и клиент.
import { isIslandMapId } from "./ids";

export const ISLAND_SATIETY_MULT = 0.1;

/** Множитель трат сытости на карте: остров — 0,1, мир — 1. */
export const satietyMultOf = (mapId: string | null | undefined): number =>
  isIslandMapId(mapId) ? ISLAND_SATIETY_MULT : 1;

/** Трата × множитель, до сотых; платное не дешевле 0,01. При 1 — как есть. */
export function scaleSatiety(cost: number, mult = 1): number {
  if (mult === 1 || !(cost > 0)) return cost;
  return Math.max(0.01, Math.round(cost * mult * 100) / 100);
}
