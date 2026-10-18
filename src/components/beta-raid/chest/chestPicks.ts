// Чистая арифметика окна сундука: раскладка по ячейкам и сколько класть.
// Без JSX — компоненты файла с логикой ломали бы горячую перезагрузку
// (react-refresh), и так её проще проверить тестом.
import { exactQty, stackCells } from "@/lib/warehouseCells";
import {
  CHEST_NET_CELLS,
  netRoomFor,
  type ChestBackpackStack,
  type ChestSlot,
} from "@/lib/magicChest";
import { buildCells, type Cell, type Stack } from "@/components/beta-raid/warehouseGrid";

const toStack = (s: {
  stackKey: string;
  kind: string;
  name: string;
  image: string | null;
  count: number;
}): Stack => ({
  stackKey: s.stackKey,
  kind: s.kind,
  name: s.name,
  image: s.image,
  count: s.count,
  cells: stackCells(s.count),
});

/** Сеть по ячейкам: десять плиток, пустые добиты до ёмкости. */
export function netCells(slots: readonly ChestSlot[], cells = CHEST_NET_CELLS): Array<Cell | null> {
  return buildCells(slots.map(toStack), cells);
}

/** Рюкзак по ячейкам: занятые + свободные до ёмкости, как в окне склада. */
export function bagCells(
  stacks: readonly ChestBackpackStack[],
  capacity: number,
  occupied: number,
): Array<Cell | null> {
  const list = stacks.map(toStack);
  const used = list.reduce((n, s) => n + s.cells, 0);
  return buildCells(list, used + Math.max(0, capacity - occupied));
}

/**
 * Сколько штук каждой плитки рюкзака можно положить в сундук: собранное стека
 * (movable — без купленного и без изношенной штуки) раскладывается по его
 * плиткам с первой, не больше штук плитки. Сумма по плиткам стека — ровно его
 * movable: окно показывает число на плитке, тап кладёт его же. 0 — плитка
 * неактивна (в ней только купленное).
 */
export function movableByCell(
  cells: ReadonlyArray<Cell | null>,
  stacks: ReadonlyArray<Pick<ChestBackpackStack, "stackKey" | "movable">>,
): Map<string, number> {
  const left = new Map(stacks.map((s) => [s.stackKey, Math.max(0, s.movable)]));
  const out = new Map<string, number>();
  for (const c of cells) {
    if (!c) continue;
    const rest = left.get(c.stack.stackKey) ?? 0;
    const here = exactQty(Math.min(c.units, rest));
    out.set(c.key, here);
    left.set(c.stack.stackKey, exactQty(rest - here));
  }
  return out;
}

/**
 * Сколько штук положить тапом: собранное плитки (movableByCell), но не
 * больше, чем влезет в сеть (купленное в сундук не кладётся — правило
 * владельца). Девять знаков, а не тысячные: собранное бывает дробным
 * (12,3456 из наград), и округление вверх просило бы больше собранного.
 */
export function storeQty(
  stack: { stackKey: string; movable: number },
  slots: readonly ChestSlot[],
): number {
  return exactQty(Math.max(0, Math.min(stack.movable, netRoomFor(slots, stack.stackKey))));
}
