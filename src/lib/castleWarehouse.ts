// Склад замка (владелец, 08.10.2026): такой же склад, как на карте, но личный —
// только свои ячейки, начиная с одной; следующая открывается за ресурсы, до 20.
// В ячейке, как и везде, 30 штук одного вида (CELL_SIZE, до 28.10.2026 — 20).

export const START_CELLS = 1;
export const MAX_CELLS = 20;

/** Цена ячейки: дерево, камень, золото, кристаллы (как у храма). */
export type CellCost = { wood: number; stone: number; gold: number; diamonds: number };

const c = (wood: number, stone = 0, gold = 0, diamonds = 0): CellCost => ({
  wood,
  stone,
  gold,
  diamonds,
});

/** Цена открытия ячейки №2…№20 (индекс — номер ячейки). Каждая ≈ ×1,45. */
export const CELL_COSTS: Record<number, CellCost> = {
  2: c(30),
  3: c(45, 10),
  4: c(65, 15),
  5: c(95, 25, 100),
  6: c(140, 35, 150),
  7: c(200, 45, 220),
  8: c(280, 65, 310, 5),
  9: c(410, 95, 450, 10),
  10: c(590, 140, 650, 10),
  11: c(860, 200, 930, 15),
  12: c(1300, 290, 1400, 20),
  13: c(1800, 420, 2000, 30),
  14: c(2600, 600, 2900, 40),
  15: c(3800, 870, 4200, 55),
  16: c(5500, 1300, 6000, 75),
  17: c(8000, 1900, 8700, 110),
  18: c(12000, 2700, 13000, 150),
  19: c(17000, 3900, 19000, 210),
  20: c(25000, 5600, 27000, 290),
};

/** Цена следующей ячейки при `cells` открытых; null — уже 20. */
export function nextCellCost(cells: number): CellCost | null {
  const n = Math.floor(cells) + 1;
  return n > MAX_CELLS ? null : (CELL_COSTS[n] ?? null);
}

export function clampCells(cells: unknown): number {
  const n = Math.floor(Number(cells) || START_CELLS);
  return Math.min(MAX_CELLS, Math.max(START_CELLS, n));
}

/** Место склада замка в общей таблице полок: своя «карта», одна клетка. */
export const CASTLE_SHELF = { mapId: "castle", q: 0, r: 0 } as const;
