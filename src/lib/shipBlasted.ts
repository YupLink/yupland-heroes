// Подбитый корабль (владелец, 30.10.2026; миграция dynamite-08): «это когда корабль
// подбили динамитом — его нельзя починить, клетка занята, исчезает через час».
//
// Срок один на сервер (уборка ship-sweep) и клиент (окно корабля: «исчезнет через…»),
// поэтому живёт здесь, а не в одном из них.

/** Сколько живёт подбитый корабль — минут от штампа blasted_at (взрыва синего). */
export const SHIP_BLASTED_TTL_MIN = 60;

const MINUTE_MS = 60_000;

/**
 * Сколько минут осталось до уборки — вверх до целой, не меньше нуля. Штампа нет —
 * null: корабль не подбит.
 */
export function blastedLeftMin(blastedAt: number | null | undefined, now: number): number | null {
  if (blastedAt == null || !Number.isFinite(blastedAt)) return null;
  const left = blastedAt + SHIP_BLASTED_TTL_MIN * MINUTE_MS - now;
  return Math.max(0, Math.ceil(left / MINUTE_MS));
}
