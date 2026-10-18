// Сумка зелий: вместимость в ячейках. Чистая формула — её одинаково читают
// сервер (проверка места) и клиент (сетка ячеек).
//
// ТЗ владельца: база по редкости героя — рар 3, эпик 4, лег 5; в ячейке до 20
// единиц товара одного вида (та же CELL_SIZE, что у рюкзака); каждые 10 Алхимии
// дают +1 ячейку. Обычного (common) героя в ТЗ нет — ему 1 ячейка, как у common
// в рюкзаке.
//
// Правило владельца 29.09: зелья живут ТОЛЬКО в сумке. В рюкзак они не
// переливаются — иначе зелий набиралось бы больше, чем позволяет Алхимия.
import type { HeroRarity } from "@/lib/heroLevels";

export const POTION_BAG_BASE: Record<HeroRarity, number> = {
  common: 1,
  rare: 3,
  epic: 4,
  legendary: 5,
};

/** Сколько ячеек в сумке зелий: база по редкости + floor(Алхимия / 10). */
export function potionBagCapacity(opts: { rarity: HeroRarity; alchemy: number }): number {
  const alchemy = Math.max(0, Math.floor(opts.alchemy));
  return POTION_BAG_BASE[opts.rarity] + Math.floor(alchemy / 10);
}

/** Ёмкость сумки для проверок: не число (старый вызов без поля) — ноль, а не NaN. */
const bagCap = (n: number): number => Math.max(0, Number(n) || 0);

/** Ячейки героя по видам: обычные товары и зелья. */
export type BagCells = { itemCells: number; potionCells: number };

/** Посчитать ячейки стеков отдельно для обычных товаров и для зелий. */
export function bagCellsOf(stacks: readonly { cells: number; potion?: boolean }[]): BagCells {
  let itemCells = 0;
  let potionCells = 0;
  for (const s of stacks) {
    if (s.potion) potionCells += s.cells;
    else itemCells += s.cells;
  }
  return { itemCells, potionCells };
}

/**
 * Занятость хранилищ: рюкзак — только обычные товары, сумка — все зелья, без
 * обрезки по ёмкости. Герой, набравший зелий больше сумки до 29.09 или
 * потерявший бафф Алхимии, видит честное «7/5»: ничего не отбираем и в рюкзак
 * не переносим. potionCapacity на раскладку больше не влияет — параметр
 * оставлен ради прежних вызывающих.
 */
export function bagsOccupancy(c: BagCells & { potionCapacity?: number }): {
  occupied: number;
  potionOccupied: number;
} {
  return { occupied: c.itemCells, potionOccupied: c.potionCells };
}

/**
 * Сколько ячеек доступно виду — для backpackRoomFor. Зелью — только сумка, и
 * строго (strict): переполненная сумка не принимает даже долив в неполную
 * ячейку. Обычному товару — только рюкзак: над ёмкостью он новых ячеек не
 * берёт, но свою неполную доливает; зелья его места не занимают.
 */
export function roomFor(
  c: BagCells & { potion: boolean; capacity: number; potionCapacity: number },
): {
  capacity: number;
  occupied: number;
  strict?: boolean;
} {
  if (c.potion) {
    return { capacity: bagCap(c.potionCapacity), occupied: c.potionCells, strict: true };
  }
  return { capacity: c.capacity, occupied: c.itemCells };
}

/**
 * Влезает ли выдача в сумку зелий: занятых ячеек после неё — не больше
 * ёмкости. Долив в неполную ячейку своего вида ячеек не прибавляет, но у
 * переполненной сумки (занято > ёмкости) не проходит и он: новые зелья такому
 * герою не приходят, пока он не опустится до ёмкости.
 *
 * need/free — числа отказа «нужно N яч., свободно M»: освободив need − free
 * ячеек, игрок гарантированно уложится (у переполненной сумки free = 0, а need
 * включает и перебор).
 */
export function potionBagFit(o: { before: number; after: number; capacity: number }): {
  fits: boolean;
  need: number;
  free: number;
} {
  const cap = bagCap(o.capacity);
  const free = Math.max(0, cap - o.before);
  return { fits: o.after <= cap, need: Math.max(1, o.after - cap + free), free };
}
