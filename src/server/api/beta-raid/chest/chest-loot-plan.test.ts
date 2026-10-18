// Раскладка добычи по рюкзаку: по очереди выбора, долив в свою ячейку, зелья
// только в сумку (правило владельца 29.09), не влезшее — пропадает.
import { describe, expect, it } from "vitest";
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
    expect(bagRoom([st("a", 15)], "a", false, caps)).toBe(5 + 2 * 20);
    expect(bagRoom([st("a", 15)], "b", false, caps)).toBe(2 * 20);
  });

  it("переполненный рюкзак не берёт новых ячеек, но доливает свою", () => {
    const over = [st("a", 12), st("b", 20), st("c", 20), st("d", 20)];
    expect(bagRoom(over, "a", false, caps)).toBe(8);
    expect(bagRoom(over, "z", false, caps)).toBe(0);
  });

  it("зелью — только сумка, свободный рюкзак не в счёт", () => {
    expect(bagRoom([], "p", true, caps)).toBe(20);
    expect(bagRoom([st("q", 20, true)], "p", true, caps)).toBe(0);
  });

  it("переполненная сумка не берёт даже долив своей ячейки", () => {
    const over = [st("p", 12, true), st("q", 20, true)];
    expect(bagRoom(over, "p", true, caps)).toBe(0);
    // Товару перебор сумки не мешает: рюкзак пуст на три ячейки.
    expect(bagRoom(over, "a", false, caps)).toBe(3 * 20);
  });
});

describe("planLoot", () => {
  it("кладёт по очереди: второй позиции достаётся то, что осталось", () => {
    const got = planLoot(
      [
        { stackKey: "a", qty: 35 },
        { stackKey: "b", qty: 30 },
        { stackKey: "c", qty: 1 },
      ],
      [],
      caps,
      new Set(),
    );
    // a — две ячейки (35 из 40), b — последняя ячейка, c — места нет.
    expect(got).toEqual([
      { stackKey: "a", qty: 35 },
      { stackKey: "b", qty: 20 },
    ]);
  });

  it("полный рюкзак — ничего не уезжает", () => {
    const full = [st("x", 20), st("y", 20), st("z", 20)];
    expect(planLoot([{ stackKey: "a", qty: 5 }], full, caps, new Set())).toEqual([]);
  });

  it("новое зелье — только в сумку, в рюкзак не переливается", () => {
    const got = planLoot([{ stackKey: "p", qty: 100 }], [st("x", 20)], caps, new Set(["p"]));
    expect(got).toEqual([{ stackKey: "p", qty: 20 }]);
  });

  it("зелье и товар по очереди: каждый в своё хранилище", () => {
    const got = planLoot(
      [
        { stackKey: "p", qty: 30 },
        { stackKey: "q", qty: 5 },
        { stackKey: "a", qty: 70 },
      ],
      [],
      caps,
      new Set(["p", "q"]),
    );
    // Сумка на одну ячейку: 20 зелья p, зелью q места нет; товару — рюкзак на три.
    expect(got).toEqual([
      { stackKey: "p", qty: 20 },
      { stackKey: "a", qty: 60 },
    ]);
  });

  it("дробный хвост в рюкзаке не обещает лишней тысячной", () => {
    const got = planLoot(
      [{ stackKey: "a", qty: 20 }],
      [st("a", 0.0235)],
      { capacity: 1, potionCapacity: 0 },
      new Set(),
    );
    expect(got).toEqual([{ stackKey: "a", qty: 19.976 }]);
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
    const full = [st("x", 20), st("y", 20), st("z", 20)];
    const plan = planLoot(chestFirst([{ stackKey: "a", qty: 5 }], chest), full, caps, new Set());
    expect(chestFits(plan, chest)).toBe(false);
  });
  it("есть ячейка: сундук ложится первым, сети — что осталось", () => {
    const bag = [st("x", 20), st("y", 20)];
    const plan = planLoot(chestFirst([{ stackKey: "a", qty: 5 }], chest), bag, caps, new Set());
    expect(plan).toEqual([chest]);
    expect(chestFits(plan, chest)).toBe(true);
    expect(chestFits([], null)).toBe(true);
  });
});
