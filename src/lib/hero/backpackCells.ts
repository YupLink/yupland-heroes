// Вместимость рюкзака героя в ЯЧЕЙКАХ. Чистый модуль (только формула): его
// одинаково читают сервер (проверка переполнения, чтение рюкзака) и клиент
// (сетка ячеек), поэтому второй копии правила «сколько ячеек у эпика» нет.
//
// База по спеце×редкости (ТЗ владельца):
//   спец \ редкость | rare | epic | legendary
//   Торговец        |  3   |  4   |    5
//   Путешественник  |  3   |  4   |    5
//   Воин/Ассасин/   |  1   |  2   |    3
//   Маг/Строитель   |
//   ПЛЮС floor(Торговля / 10) дополнительных ячеек любому.
//
// Одна ячейка вмещает CELL_SIZE единиц ОДНОГО вида товара; разные виды — в
// разные ячейки. Занятые ячейки одного стека = ceil(count / CELL_SIZE).
import { normalizeSpec } from "./heroStatSources";
import type { HeroRarity } from "@/lib/heroLevels";

/** Сколько единиц одного вида помещается в одну ячейку. */
export const CELL_SIZE = 20;

// Торговец и Путешественник — «торговая» группа (просторный рюкзак), остальные
// боевые спецы носят меньше. Common — стартовый герой (спец у него нет), ровно
// одна ячейка на любой роли.
const BASE = {
  trader: { common: 1, rare: 3, epic: 4, legendary: 5 },
  other: { common: 1, rare: 1, epic: 2, legendary: 3 },
} as const;

/** Сколько всего ячеек в рюкзаке героя: база спеца×редкости + бонус торговли. */
export function backpackCapacity(opts: {
  spec: string | null;
  rarity: HeroRarity;
  trade: number;
}): number {
  const s = normalizeSpec(opts.spec);
  const group: keyof typeof BASE = s === "Торговец" || s === "Путешественник" ? "trader" : "other";
  const trade = Math.max(0, Math.floor(opts.trade));
  return BASE[group][opts.rarity] + Math.floor(trade / 10);
}

/** Сколько ячеек занимает стек из count единиц. Пустой стек — ноль ячеек. */
export const stackCells = (count: number): number =>
  Math.ceil(Math.max(0, count) / CELL_SIZE);

/** Всего занятых ячеек по счётчикам стеков. */
export function occupiedCells(counts: readonly number[]): number {
  let sum = 0;
  for (const c of counts) sum += stackCells(c);
  return sum;
}

/**
 * Сколько единиц ЭТОГО товара реально влезет в рюкзак сверх того, что уже
 * лежит. Возвращает число единиц (не ячеек!): «влезет ещё 57 штук яблок».
 *
 * Считается симметрично assertBackpackRoomFor: сначала доливаем в неполный
 * стек ТОГО ЖЕ вида (доборные единицы не занимают новую ячейку), потом
 * занимаем НОВЫЕ ячейки за счёт свободного места.
 *
 * Ноль значит «полный рюкзак ИЛИ уже перебор»: даже одну штуку не примем,
 * не надо чинить забор, надо сначала освободить место.
 *
 * `overCapacity: true` не расширяет комнату: рюкзак умеет оказаться НАД
 * ёмкостью (склад отдал, сняли арт с торговлей), и надо ЗАПРЕТИТЬ новые
 * ячейки, но НЕ мешать доливать текущий стек — так же как в
 * assertBackpackRoomFor.
 *
 * `strict: true` — сумка зелий (правило владельца 29.09): над ёмкостью она не
 * принимает ничего, даже долив. Флаг приходит из roomFor вместе с ёмкостью.
 */
export function backpackRoomFor(opts: {
  capacity: number;
  /** Сколько единиц товара уже лежит именно в стеке этого товара. */
  cur: number;
  /** Всего ячеек рюкзака сейчас занято (по всем стекам, включая этот). */
  occupied: number;
  /** Строгая ёмкость: занято больше неё — ноль, без долива. */
  strict?: boolean;
}): number {
  // cur без floor: дробный стек (0,79 Огурцов от босса) занимает ячейку — SQL
  // рюкзака считает CEIL, а floor обещал «влезет 20» при реальных 19,21 и
  // сервер потом отвечал «нужно 1, свободно 0». occupied — уже целое число ячеек.
  const cur = Math.max(0, opts.cur);
  const occupied = Math.max(0, Math.floor(opts.occupied));
  if (opts.strict && occupied > opts.capacity) return 0;
  const curCells = stackCells(cur);
  const others = Math.max(0, occupied - curCells);
  // Долив в уже открытую ячейку — «дырка» в текущей ячейке этого товара.
  const holeInCur = curCells * CELL_SIZE - cur;
  // Новые ячейки этого товара, которые допустимо занять сверх others.
  const newCells = Math.max(0, opts.capacity - others - curCells);
  return holeInCur + newCells * CELL_SIZE;
}
