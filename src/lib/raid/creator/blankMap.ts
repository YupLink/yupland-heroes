// Голая карта креатора (владелец, 07.11.2026: «отдельный мир, но вообще без
// карты — голая карта»; вечером: «начать делать из пустоты… а не клочок
// посреди воды»). Все клетки рамки — пустые: без земли, дорог, декора и
// построек. Пустая клетка рисуется пустым шестиугольником сетки; землю на неё
// кладёт кисть «Местность», остальное — уже поверх земли (сервер без земли
// декор, объект и постройку не ставит — admin-live-batch). Герой встаёт в
// центр: позиция пишется без проверки земли.
//
// Расширение (64 → 128 → 256 → 512) растит рамку вокруг того же центра: старая
// рамка лежит внутри новой целиком, созданное остаётся на своих клетках.
import { offsetToAxial } from "@/lib/hex-renderer";
import type { Cell } from "@/lib/raid/worldgen/geo";

/** Рамка нового мира — как у острова новичка (64 × 64 клетки offset, ISLAND_SIZE). */
export const CREATOR_MAP_SIZE = 64;
/** Центр всех рамок (offset): середина первой, 64 × 64. */
const MID = CREATOR_MAP_SIZE / 2;

/** Клетки рамки size × size вокруг общего центра; для 64 — столбцы и строки 0…63. */
export function frameCells(size: number): Cell[] {
  const n = Math.max(4, Math.floor(size));
  const from = MID - Math.floor(n / 2);
  const cells: Cell[] = [];
  for (let row = from; row < from + n; row++) {
    for (let col = from; col < from + n; col++) {
      const { q, r } = offsetToAxial(col, row);
      cells.push({ q, r });
    }
  }
  return cells;
}

/** Старт героя — центр рамки (тот же у любого размера). */
export const frameCenter = (): Cell => {
  const { q, r } = offsetToAxial(MID, MID);
  return { q, r };
};

/** Клетки голой карты (только координаты) и старт героя — центр рамки. */
export function blankMapCells(size = CREATOR_MAP_SIZE): { cells: Cell[]; spawn: Cell } {
  return { cells: frameCells(size), spawn: frameCenter() };
}

/** Клетки, которые добавит расширение from → to (новая рамка без старой). */
export function growCells(from: number, to: number): Cell[] {
  const old = new Set(frameCells(from).map((c) => `${c.q},${c.r}`));
  return frameCells(to).filter((c) => !old.has(`${c.q},${c.r}`));
}
