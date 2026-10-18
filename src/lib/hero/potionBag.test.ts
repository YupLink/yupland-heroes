// Сумка зелий (правило владельца 29.09): зелья живут ТОЛЬКО в сумке — в рюкзак
// не переливаются, рюкзак считает лишь обычные товары. Переполненная сумка
// (перебор до 29.09, кончился бафф Алхимии) ничего не теряет, но и новых зелий
// не берёт — даже долив в неполную ячейку.
import { describe, it, expect } from "vitest";
import { backpackRoomFor } from "./backpackCells";
import { bagCellsOf, bagsOccupancy, potionBagCapacity, potionBagFit, roomFor } from "./potionBag";

/** Сколько штук вида влезет: та же связка, что у склада, сундука и «Макс». */
const room = (
  cells: { itemCells: number; potionCells: number },
  o: { potion: boolean; capacity: number; potionCapacity: number; cur?: number },
) => backpackRoomFor({ ...roomFor({ ...cells, ...o }), cur: o.cur ?? 0 });

describe("bagsOccupancy", () => {
  it("рюкзак занят только товарами, сумка — всеми зельями", () => {
    expect(bagsOccupancy({ itemCells: 2, potionCells: 3, potionCapacity: 3 })).toEqual({
      occupied: 2,
      potionOccupied: 3,
    });
  });

  it("зелья сверх сумки не занимают рюкзак и не обрезаются: 5/3 так и видно", () => {
    expect(bagsOccupancy({ itemCells: 2, potionCells: 5, potionCapacity: 3 })).toEqual({
      occupied: 2,
      potionOccupied: 5,
    });
  });

  it("ёмкость сумки на раскладку не влияет (старые вызовы без неё)", () => {
    expect(bagsOccupancy({ itemCells: 1, potionCells: 4 })).toEqual({
      occupied: 1,
      potionOccupied: 4,
    });
  });
});

describe("roomFor + backpackRoomFor", () => {
  const cells = bagCellsOf([
    { cells: 2, potion: false },
    { cells: 1, potion: true },
  ]);

  it("зелью — только свободное в сумке; свободный рюкзак не в счёт", () => {
    // Рюкзак 5 (занято 2 — свободно 3), сумка 3 (занято 1): новых ячеек 2.
    expect(room(cells, { potion: true, capacity: 5, potionCapacity: 3 })).toBe(40);
  });

  it("сумка полна, рюкзак пуст — зелью ноль", () => {
    const full = { itemCells: 0, potionCells: 3 };
    expect(room(full, { potion: true, capacity: 9, potionCapacity: 3 })).toBe(0);
  });

  it("обычному товару — только рюкзак; зелья сверх сумки его места не занимают", () => {
    const over = { itemCells: 2, potionCells: 7 };
    expect(room(over, { potion: false, capacity: 3, potionCapacity: 3 })).toBe(20);
  });

  it("рюкзак над ёмкостью доливает свою ячейку, а новых не берёт — как раньше", () => {
    const over = { itemCells: 4, potionCells: 0 };
    expect(room(over, { potion: false, capacity: 3, potionCapacity: 3, cur: 15 })).toBe(5);
    expect(room(over, { potion: false, capacity: 3, potionCapacity: 3 })).toBe(0);
  });

  it("сумка ровно полна: долив в неполную ячейку своего вида — до края ячейки", () => {
    const atCap = { itemCells: 0, potionCells: 3 };
    expect(room(atCap, { potion: true, capacity: 0, potionCapacity: 3, cur: 14 })).toBe(6);
    // Дробная крошка (0,4 зелья) — тоже занятая ячейка: долив до 20.
    expect(room(atCap, { potion: true, capacity: 0, potionCapacity: 3, cur: 0.4 })).toBeCloseTo(
      19.6,
    );
  });

  it("переполненная сумка: ноль даже на долив, сколько бы ни было в рюкзаке", () => {
    const over = { itemCells: 0, potionCells: 5 };
    expect(room(over, { potion: true, capacity: 9, potionCapacity: 3, cur: 14 })).toBe(0);
    expect(room(over, { potion: true, capacity: 9, potionCapacity: 3 })).toBe(0);
  });

  it("ёмкость сумки не пришла (NaN) — зелью ноль, а не «сколько угодно»", () => {
    const empty = { itemCells: 0, potionCells: 0 };
    expect(room(empty, { potion: true, capacity: 9, potionCapacity: Number.NaN })).toBe(0);
  });
});

describe("бафф Алхимии: временная ёмкость сумки", () => {
  // Редкий герой: база 3, +10 Алхимии из баффа — 4 ячейки.
  const withBuff = potionBagCapacity({ rarity: "rare", alchemy: 10 });
  const noBuff = potionBagCapacity({ rarity: "rare", alchemy: 0 });

  it("с баффом четвёртая ячейка принимает зелья", () => {
    expect(withBuff).toBe(4);
    const bag = { itemCells: 0, potionCells: 3 };
    expect(room(bag, { potion: true, capacity: 1, potionCapacity: withBuff })).toBe(20);
  });

  it("бафф кончился: зелья остаются в сумке (4/3), новых — ни штуки", () => {
    const bag = { itemCells: 0, potionCells: 4 };
    expect(bagsOccupancy({ ...bag, potionCapacity: noBuff })).toEqual({
      occupied: 0,
      potionOccupied: 4,
    });
    expect(room(bag, { potion: true, capacity: 5, potionCapacity: noBuff, cur: 3 })).toBe(0);
    // Выпил одну ячейку — снова ровно по ёмкости, долив своей ячейки открыт.
    const drank = { itemCells: 0, potionCells: 3 };
    expect(room(drank, { potion: true, capacity: 5, potionCapacity: noBuff, cur: 3 })).toBe(17);
  });
});

describe("potionBagFit — числа отказа", () => {
  it("влезает, пока после выдачи занято не больше ёмкости", () => {
    expect(potionBagFit({ before: 2, after: 3, capacity: 3 }).fits).toBe(true);
    expect(potionBagFit({ before: 3, after: 3, capacity: 3 }).fits).toBe(true);
  });

  it("не влезает: need — прирост, free — свободное в сумке", () => {
    expect(potionBagFit({ before: 2, after: 5, capacity: 3 })).toEqual({
      fits: false,
      need: 3,
      free: 1,
    });
  });

  it("переполненная сумка: free 0, need — перебор плюс прирост, и никогда не 0", () => {
    // 5 при ёмкости 3, долив без новых ячеек: освободить две — и уложится.
    expect(potionBagFit({ before: 5, after: 5, capacity: 3 })).toEqual({
      fits: false,
      need: 2,
      free: 0,
    });
    expect(potionBagFit({ before: 5, after: 6, capacity: 3 })).toEqual({
      fits: false,
      need: 3,
      free: 0,
    });
  });
});
