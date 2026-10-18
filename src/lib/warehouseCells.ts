// Сколько влезает в склад. Чистый модуль: одну и ту же арифметику считают
// сервер (проверка места) и окно склада (сетка ячеек).
//
// Десять ячеек: две личные у каждого игрока и восемь общих на всех. Личные
// заполняются первыми — своё кладётся к себе, а на общую полку уходит то,
// что уже не поместилось.
//
// Единицы бывают ДРОБНЫМИ: награды боссов дают 0,02…0,39 «Зимних Огурцов», и
// такой хвост тоже должен лечь на полку (жалоба владельца 20.09.2026: игрок с
// 0,79/20 в рюкзаке получал «Склад заполнен» при пустом складе). Место при этом
// считается по ячейкам — ceil(count / CELL_SIZE), как у рюкзака.
import { CELL_SIZE } from "@/lib/hero/backpackCells";

export { CELL_SIZE };

/** Личные ячейки игрока на складе. */
export const OWN_CELLS = 2;
/** Общие ячейки склада — доступны всем. */
export const SHARED_CELLS = 8;
/** Всего ячеек в окне склада. */
export const TOTAL_CELLS = OWN_CELLS + SHARED_CELLS;

/**
 * Одно правило округления количества для склада и его окна: до тысячных, как
 * qtyNum у рюкзака. Без него 0,3 − 0,1 уезжает в SQL как 0,19999999999999998,
 * а после «забрать 0,79 из 20,79» на полке остаётся хвост 9e-16 > 0 — строка
 * проходит фильтр count > 0 и занимает ЦЕЛУЮ призрачную ячейку.
 */
export const roundQty = (n: number): number => Math.max(0, Math.round(n * 1000) / 1000);

/**
 * Пыль — меньше тысячной единицы. Товаром её не назвать, а ячейку она занимает
 * целиком, поэтому перенос между рюкзаком и складом забирает её с собой.
 */
export const DUST = 0.001;

/**
 * Количество ручного переноса: девять знаков, как у выброса (backpack-discard).
 * Мельче — шум double↔numeric. Тысячных тут мало: у 7,738083 «всё» до
 * тысячных оставляло в рюкзаке 0,000083 на целую ячейку (жалоба 27.09.2026).
 */
export const exactQty = (n: number): number => Math.max(0, Math.round(n * 1e9) / 1e9);

/**
 * Сколько переносить, когда в стеке have, а просят asked: ровно просьбу, но
 * если после неё осталось бы меньше тысячной (или просят больше, чем есть) —
 * весь стек, точным количеством. Пыль ячейкой не висит.
 */
export function moveQty(have: number, asked: number): number {
  const cur = exactQty(have);
  const n = Math.min(exactQty(asked), cur);
  return cur - n < DUST ? cur : n;
}

/** Сколько ячеек занимает стек из count единиц. */
export const stackCells = (count: number): number =>
  count <= 0 ? 0 : Math.ceil(count / CELL_SIZE);

/** Занятые ячейки по списку стеков. */
export const occupiedCells = (counts: number[]): number =>
  counts.reduce((sum, c) => sum + stackCells(c), 0);

/**
 * Куда класть: сам решает (сперва личные, остаток на общую), только в свои
 * или только в общие. Игроки просили выбор — «положил в общую, а хотел себе».
 */
export type DepositScope = "auto" | "own" | "shared";

/**
 * Как разложить qty единиц: сначала в свои ячейки, остаток — на общую полку.
 *
 * ownSame/sharedSame — сколько единиц ТОГО ЖЕ вида уже лежит (для них место
 * считается по остатку ячейки); ownCounts/sharedCounts — ВСЕ стеки полки,
 * включая стек этого вида: остальные заняли ячейки целиком. Возвращает,
 * сколько уйдёт в личное, сколько в общее и сколько не влезло вовсе.
 */
export function splitDeposit(opts: {
  qty: number;
  /** Куда класть. По умолчанию прежнее поведение — «auto». */
  scope?: DepositScope;
  /** Единицы этого вида, уже лежащие в личных ячейках игрока. */
  ownSame: number;
  /** Все стеки личных ячеек игрока (включая этот вид). */
  ownCounts: number[];
  /** Единицы этого вида на общей полке. */
  sharedSame: number;
  /** Все стеки общей полки. */
  sharedCounts: number[];
  /**
   * Ручной перенос (warehouse.ts): количество уже дал moveQty, и тысячные
   * вернули бы в рюкзак ту самую пыль. Урожай с полей считает по-старому.
   */
  exact?: boolean;
  /** Личных ячеек (склад замка — по уровню); по умолчанию OWN_CELLS. */
  ownCells?: number;
  /** Общих ячеек (у склада замка их нет); по умолчанию SHARED_CELLS. */
  sharedCells?: number;
}): { own: number; shared: number; rejected: number } {
  const room = (same: number, counts: number[], cells: number) => {
    // Чужие стеки — все ячейки полки минус ячейки НАШЕГО стека. Раньше свой
    // стек исключался по значению (`c === same`), и два стека с одинаковым
    // счётом (Помидоры 20 | Молоко 20) выпадали из «занято» оба: полка на
    // деле полная считалась свободной, и товар молча пропадал в upsertSlot.
    const others = Math.max(0, occupiedCells(counts) - stackCells(same));
    // Ячейки, которые может занять наш вид: всё, что не занято чужими стеками.
    const free = Math.max(0, cells - others);
    return Math.max(0, free * CELL_SIZE - same);
  };
  const round = opts.exact ? exactQty : roundQty;
  const qty = round(opts.qty);
  const scope = opts.scope ?? "auto";
  const own =
    scope === "shared"
      ? 0
      : round(Math.min(qty, room(opts.ownSame, opts.ownCounts, opts.ownCells ?? OWN_CELLS)));
  let shared =
    scope === "own"
      ? 0
      : round(
          Math.min(
            qty - own,
            room(opts.sharedSame, opts.sharedCounts, opts.sharedCells ?? SHARED_CELLS),
          ),
        );
  // Пыль, не влезшая в своё, не открывает ячейку на общей полке — остаётся.
  if (own > 0 && shared < DUST) shared = 0;
  return { own, shared, rejected: round(qty - own - shared) };
}
