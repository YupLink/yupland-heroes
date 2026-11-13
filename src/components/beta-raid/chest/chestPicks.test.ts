import { describe, expect, it } from "vitest";
import type { ChestSlot } from "@/lib/magicChest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import {
  bagCells,
  movableByCell,
  netCells,
  storeQty,
} from "@/components/beta-raid/chest/chestPicks";

const slot = (stackKey: string, count: number): ChestSlot => ({
  stackKey,
  kind: "custom",
  name: stackKey,
  image: null,
  count,
});

describe("netCells", () => {
  it("режет стек по ячейке и добивает до десяти ячеек", () => {
    const cells = netCells([slot("a", 2 * CELL_SIZE + 5), slot("b", 0.79)]);
    expect(cells).toHaveLength(10);
    expect(cells.slice(0, 4).map((c) => c?.units)).toEqual([CELL_SIZE, CELL_SIZE, 5, 0.79]);
    expect(cells.slice(4).every((c) => c === null)).toBe(true);
  });
});

describe("bagCells", () => {
  it("занятые плюс свободные до ёмкости", () => {
    const cells = bagCells([{ ...slot("a", CELL_SIZE + 10), movable: 10 }], 5, 2);
    expect(cells).toHaveLength(5);
    expect(cells.filter(Boolean)).toHaveLength(2);
  });
  it("рюкзак над ёмкостью не прячет лежащее", () => {
    expect(bagCells([{ ...slot("a", 3 * CELL_SIZE), movable: 0 }], 1, 3)).toHaveLength(3);
  });
});

describe("movableByCell: сколько положить с каждой плитки", () => {
  it("собранное стека раскладывается по его плиткам с первой, сумма — ровно movable", () => {
    const stacks = [
      { ...slot("a", 2 * CELL_SIZE + 5), movable: CELL_SIZE + 7.5 },
      { ...slot("b", 12), movable: 0 },
    ];
    const cells = bagCells(stacks, 6, 4);
    const m = movableByCell(cells, stacks);
    expect(cells.filter(Boolean).map((c) => m.get(c!.key))).toEqual([CELL_SIZE, 7.5, 0, 0]);
  });

  it("смешанная стопка: число — только собранное, купленное плитку гасит", () => {
    const stacks = [{ ...slot("mix", 15), movable: 6 }];
    const m = movableByCell(bagCells(stacks, 2, 1), stacks);
    expect([...m.values()]).toEqual([6]);
    const bought = [{ ...slot("buy", 15), movable: 0 }];
    expect([...movableByCell(bagCells(bought, 2, 1), bought).values()]).toEqual([0]);
  });

  it("дробное собранное — девять знаков, без хвоста double", () => {
    const stacks = [{ ...slot("d", CELL_SIZE + 5.5), movable: CELL_SIZE + 0.3456 }];
    const m = movableByCell(bagCells(stacks, 3, 2), stacks);
    expect([...m.values()]).toEqual([CELL_SIZE, 0.3456]);
  });
});

describe("storeQty", () => {
  it("кладём только собранное плитки", () => {
    expect(storeQty({ stackKey: "a", movable: 7 }, [])).toBe(7);
  });
  it("не больше места в сети", () => {
    const full = Array.from({ length: 9 }, (_, i) => slot(`x${i}`, CELL_SIZE));
    const movable = 2 * CELL_SIZE;
    expect(storeQty({ stackKey: "a", movable }, full)).toBe(CELL_SIZE);
    expect(storeQty({ stackKey: "a", movable }, [...full, slot("y", CELL_SIZE)])).toBe(0);
  });
  it("долив в свою неполную ячейку", () => {
    const full = Array.from({ length: 9 }, (_, i) => slot(`x${i}`, CELL_SIZE));
    const slots = [...full, slot("a", CELL_SIZE - 5)];
    expect(storeQty({ stackKey: "a", movable: 10 }, slots)).toBe(5);
  });
  it("дробь не округляется вверх: просим не больше собранного", () => {
    expect(storeQty({ stackKey: "a", movable: 12.3456 }, [])).toBe(12.3456);
  });
});
