// Раскладка окна героя (правило владельца 29.09): рюкзак рисует только обычные
// товары, сумка — все зелья, даже сверх ёмкости: ничего не прячем и в рюкзак не
// переносим.
import { describe, expect, it } from "vitest";
import { bagLayout } from "@/components/beta-raid/backpackCellList";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";

const stack = (stackKey: string, count: number, potion: boolean): BackpackStack => ({
  stackKey,
  kind: "custom",
  name: stackKey,
  image: null,
  count,
  cells: Math.ceil(count / 20),
  potion,
  collected: 0,
  chest: false,
});

const keys = (cells: ReadonlyArray<{ stackKey: string } | null>) =>
  cells.map((c) => (c ? c.stackKey : null));

describe("bagLayout", () => {
  it("зелья — в сумке, товары — в рюкзаке, пустые ячейки до ёмкости", () => {
    const l = bagLayout([stack("apple", 25, false), stack("heal", 5, true)], 3, 2);
    expect(keys(l.backpack)).toEqual(["apple", "apple", null]);
    expect(keys(l.potions)).toEqual(["heal", null]);
  });

  it("переполненная сумка: все зелья в ней, рюкзак их не показывает", () => {
    const l = bagLayout(
      [stack("heal", 45, true), stack("speed", 20, true), stack("apple", 1, false)],
      2,
      2,
    );
    expect(keys(l.potions)).toEqual(["heal", "heal", "heal", "speed"]);
    expect(l.potions.reduce((n, c) => n + (c?.units ?? 0), 0)).toBe(65);
    expect(keys(l.backpack)).toEqual(["apple", null]);
  });

  it("без зелий сумка — пустые ячейки по ёмкости", () => {
    const l = bagLayout([stack("apple", 5, false)], 1, 3);
    expect(keys(l.potions)).toEqual([null, null, null]);
  });
});
