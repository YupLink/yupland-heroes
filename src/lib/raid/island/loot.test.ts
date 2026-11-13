import { describe, expect, it } from "vitest";
import { DIG_TABLE, DIG_TABLE_COUNT, digLoot } from "@/lib/raid/island/loot";
import { ISLAND_COUNTS } from "@/lib/raid/island/catalog";

describe("клады острова", () => {
  it("таблица описывает все клады сверх главного (40 всего)", () => {
    expect(DIG_TABLE_COUNT).toBe(ISLAND_COUNTS.digs);
    expect(ISLAND_COUNTS.digs + 1).toBe(40);
  });

  it("начинка: вид по таблице, число в своём диапазоне, тот же сид — то же", () => {
    for (const seed of [11, 222, 3333]) {
      const loot = Array.from({ length: ISLAND_COUNTS.digs }, (_, i) => digLoot(i, seed));
      for (const g of DIG_TABLE) {
        const mine = loot.filter((l) => l[0].item === g.item);
        expect(mine.length, `${seed} ${g.item}`).toBe(g.count);
        for (const l of mine) {
          expect(l[0].n).toBeGreaterThanOrEqual(g.min);
          expect(l[0].n).toBeLessThanOrEqual(g.max);
        }
      }
      expect(loot).toEqual(Array.from({ length: ISLAND_COUNTS.digs }, (_, i) => digLoot(i, seed)));
    }
    // Разные сиды — разный порядок.
    const order = (seed: number) => [0, 1, 2, 3, 4, 5].map((i) => digLoot(i, seed)[0].item).join();
    expect(new Set([11, 222, 3333, 44444].map(order)).size).toBeGreaterThan(1);
  });
});
