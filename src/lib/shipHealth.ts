// Запас хода корабля — числа и формулы, общие для сервера и карты.
//
// Спека владельца (08.09.2026): корабль — транспорт с расходуемым ресурсом.
// Посадка и высадка стоят по 50, гребок по воде 3, по океану 5 (океан только
// большому). Ноль не запирает судно посреди моря: пока капитан на борту, оно
// довозит до берега, а ломается в момент схода. Починка — за доски.
//
// Энергию это НЕ заменяет: энергия тратится у игрока (shipRules), запас хода —
// у самого судна.

export type ShipKind = "small" | "big";

/** Полный запас: 1Lv — 1000, 2Lv — 2000. */
export const SHIP_MAX_HP: Record<ShipKind, number> = { small: 1000, big: 2000 };

/** Забраться на борт и сойти с него — по 50 с каждой стороны. */
export const SHIP_BOARD_HP = 50;
export const SHIP_ASHORE_HP = 50;

/** Гребок: обычная вода 3, океан 5. */
export const SHIP_STEP_HP_WATER = 3;
export const SHIP_STEP_HP_OCEAN = 5;

/** Сколько жизней возвращает одна доска. Полный ремонт малого — 50 досок. */
export const SHIP_HP_PER_PLANK = 20;

/** Товар-починка ищется по имени: «Доска», «доски», «planks». */
export const PLANK_NAME_RE = /(доск|plank)/i;

export const shipMaxHp = (kind: ShipKind): number => SHIP_MAX_HP[kind] ?? SHIP_MAX_HP.small;

/** Цена гребка в жизнях — по типу воды под килем. */
export const shipStepHp = (ocean: boolean): number =>
  ocean ? SHIP_STEP_HP_OCEAN : SHIP_STEP_HP_WATER;

/**
 * Судно разрушено: жизни кончились И на борту никого. Пока экипаж записан,
 * корабль на ходу — это и есть «дай доехать до берега».
 */
export const shipBroken = (hp: number, hasCrew: boolean): boolean => hp <= 0 && !hasCrew;

/** Сколько досок нужно, чтобы залатать судно доверху. */
export function planksToRepair(hp: number, kind: ShipKind): number {
  const missing = Math.max(0, shipMaxHp(kind) - Math.max(0, hp));
  return Math.ceil(missing / SHIP_HP_PER_PLANK);
}

/** Сколько жизней вернут эти доски (сверх полного запаса не наливаем). */
export function repairedHp(hp: number, kind: ShipKind, planks: number): number {
  const gain = Math.max(0, Math.floor(planks)) * SHIP_HP_PER_PLANK;
  return Math.min(shipMaxHp(kind), Math.max(0, hp) + gain);
}

/** Доля запаса для полоски под кораблём: 0…1. */
export const shipHpRatio = (hp: number, kind: ShipKind): number =>
  Math.max(0, Math.min(1, hp / shipMaxHp(kind)));
