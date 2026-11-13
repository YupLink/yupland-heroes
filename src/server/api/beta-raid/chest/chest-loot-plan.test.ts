// Раскладка добычи по рюкзаку: по очереди выбора, долив в свою ячейку, зелья
// только в сумку (правило владельца 29.09), не влезшее — пропадает.
import { describe, expect, it } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import {
  bagRoom,
  chestFirst,
  chestFits,
  floor3,
  lostOf,
  planLoot,
  type BagStack,
} from "@/server/api/beta-raid/chest/chest-loot-plan";

const caps = { capacity: 3, potionCapacity: 1 };
const st = (stackKey: string, count: number, potion = false): BagStack => ({
  stackKey,
  count,
  potion,
});

describe("floor3", () => {
  it("режет вниз до тысячных и не спотыкается о 0,57 × 1000", () => {
    expect(floor3(19.9765)).toBe(19.976);
    expect(floor3(0.57)).toBe(0.57);
    expect(floor3(0.29)).toBe(0.29);
    expect(floor3(-1)).toBe(0);
  });
});

describe("bagRoom", () => {
  it("хвост своей ячейки плюс свободные ячейки целиком", () => {
    expect(bagRoom([st("a", CELL_SIZE - 5)], "a", false, caps)).toBe(5 + 2 * CELL_SIZE);
    expect(bagRoom([st("a", CELL_SIZE - 5)], "b", false, caps)).toBe(2 * CELL_SIZE);
  });

  it("переполненный рюкзак не берёт новых ячеек, но доливает свою", () => {
    const over = [
      st("a", CELL_SIZE - 8),
      st("b", CELL_SIZE),
      st("c", CELL_SIZE),
      st("d", CELL_SIZE),
    ];
    expect(bagRoom(over, "a", false, caps)).toBe(8);
    expect(bagRoom(over, "z", false, caps)).toBe(0);
  });

  it("зелью — только сумка, свободный рюкзак не в счёт", () => {
    expect(bagRoom([], "p", true, caps)).toBe(CELL_SIZE);
    expect(bagRoom([st("q", CELL_SIZE, true)], "p", true, caps)).toBe(0);
  });

  it("переполненная сумка не берёт даже долив своей ячейки", () => {
    const over = [st("p", CELL_SIZE - 8, true), st("q", CELL_SIZE, true)];
    expect(bagRoom(over, "p", true, caps)).toBe(0);
    // Товару перебор сумки не мешает: рюкзак пуст на три ячейки.
    expect(bagRoom(over, "a", false, caps)).toBe(3 * CELL_SIZE);
  });
});

describe("planLoot", () => {
  it("кладёт по очереди: второй позиции достаётся то, что осталось", () => {
    const got = planLoot(
      [
        { stackKey: "a", qty: 2 * CELL_SIZE - 5 },
        { stackKey: "b", qty: CELL_SIZE + 10 },
        { stackKey: "c", qty: 1 },
      ],
      [],
      caps,
      new Set(),
    );
    // a — две ячейки (без 5 до полных), b — последняя ячейка, c — места нет.
    expect(got).toEqual([
      { stackKey: "a", qty: 2 * CELL_SIZE - 5 },
      { stackKey: "b", qty: CELL_SIZE },
    ]);
  });

  it("полный рюкзак — ничего не уезжает", () => {
    const full = [st("x", CELL_SIZE), st("y", CELL_SIZE), st("z", CELL_SIZE)];
    expect(planLoot([{ stackKey: "a", qty: 5 }], full, caps, new Set())).toEqual([]);
  });

  it("новое зелье — только в сумку, в рюкзак не переливается", () => {
    const got = planLoot(
      [{ stackKey: "p", qty: 5 * CELL_SIZE }],
      [st("x", CELL_SIZE)],
      caps,
      new Set(["p"]),
    );
    expect(got).toEqual([{ stackKey: "p", qty: CELL_SIZE }]);
  });

  it("зелье и товар по очереди: каждый в своё хранилище", () => {
    const got = planLoot(
      [
        { stackKey: "p", qty: CELL_SIZE + 10 },
        { stackKey: "q", qty: 5 },
        { stackKey: "a", qty: 3 * CELL_SIZE + 10 },
      ],
      [],
      caps,
      new Set(["p", "q"]),
    );
    // Сумка на одну ячейку: ячейка зелья p, зелью q места нет; товару — рюкзак на три.
    expect(got).toEqual([
      { stackKey: "p", qty: CELL_SIZE },
      { stackKey: "a", qty: 3 * CELL_SIZE },
    ]);
  });

  it("дробный хвост в рюкзаке не обещает лишней тысячной", () => {
    const got = planLoot(
      [{ stackKey: "a", qty: CELL_SIZE }],
      [st("a", 0.0235)],
      { capacity: 1, potionCapacity: 0 },
      new Set(),
    );
    // Место — ячейка без 0,0235; вниз до тысячных — без 0,024.
    expect(got).toEqual([{ stackKey: "a", qty: CELL_SIZE - 0.024 }]);
  });
});

describe("lostOf", () => {
  it("всё из сети минус уехавшее; взятое целиком не пропадает", () => {
    const items = [
      { stackKey: "a", count: 40 },
      { stackKey: "b", count: 7 },
      { stackKey: "c", count: 3 },
    ];
    const taken = [
      { stackKey: "a", qty: 25 },
      { stackKey: "b", qty: 7 },
    ];
    expect(lostOf(items, taken)).toEqual([
      { stackKey: "a", qty: 15 },
      { stackKey: "c", qty: 3 },
    ]);
  });
});

describe("chestFirst / chestFits", () => {
  const chest = { stackKey: "custom:cst_magic_chest", qty: 1 };
  it("сундук первым и целиком, даже если клиент его снял или прислал ноль", () => {
    expect(chestFirst([{ stackKey: "a", qty: 5 }], chest)).toEqual([
      chest,
      { stackKey: "a", qty: 5 },
    ]);
    expect(
      chestFirst(
        [
          { stackKey: "a", qty: 5 },
          { ...chest, qty: 0 },
        ],
        chest,
      ),
    ).toEqual([chest, { stackKey: "a", qty: 5 }]);
    expect(chestFirst([{ stackKey: "a", qty: 5 }], null)).toEqual([{ stackKey: "a", qty: 5 }]);
  });
  it("полный рюкзак: сундук в план не лёг — забор не начинается", () => {
    const full = [st("x", CELL_SIZE), st("y", CELL_SIZE), st("z", CELL_SIZE)];
    const plan = planLoot(chestFirst([{ stackKey: "a", qty: 5 }], chest), full, caps, new Set());
    expect(chestFits(plan, chest)).toBe(false);
  });
  it("есть ячейка: сундук ложится первым, сети — что осталось", () => {
    const bag = [st("x", CELL_SIZE), st("y", CELL_SIZE)];
    const plan = planLoot(chestFirst([{ stackKey: "a", qty: 5 }], chest), bag, caps, new Set());
    expect(plan).toEqual([chest]);
    expect(chestFits(plan, chest)).toBe(true);
    expect(chestFits([], null)).toBe(true);
  });
});
