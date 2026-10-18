// Числа окна мешочка (как у склада): сколько можно положить (надбитый
// инструмент остаётся), что предлагает окно «сколько» у плитки, плитки
// мешочка по ячейкам и срок на плитке.
import { describe, expect, it } from "vitest";
import {
  bagCells,
  leftLabel,
  movableOf,
  putPick,
  takePick,
} from "@/components/beta-raid/loot-bag/lootBagPick";

const H = 3600_000;
const item = (count: number) => ({
  stackKey: "custom:cst_b",
  kind: "custom",
  refId: "cst_b",
  name: "banana",
  image: null,
  count,
  leftMs: H,
});

describe("movableOf", () => {
  it("надбитая штука инструмента остаётся; целые и не инструмент — все", () => {
    expect(movableOf({ count: 3, durability: 40 })).toBe(2);
    expect(movableOf({ count: 1, durability: 40 })).toBe(0);
    expect(movableOf({ count: 3, durability: 100 })).toBe(3);
    expect(movableOf({ count: 2.5, durability: null })).toBe(2.5);
  });
});

describe("плитки и окно «сколько»", () => {
  it("мешочек по ячейкам склада, без пустых; имя — через перевод", () => {
    const cells = bagCells([item(45)], (n) => n.toUpperCase());
    expect(cells.map((c) => c.units)).toEqual([20, 20, 5]);
    expect(cells[0].stack.name).toBe("BANANA");
  });

  it("забрать: «Ячейку» — плитка, «Всё» — вся позиция", () => {
    const [, , last] = bagCells([item(45)], (n) => n);
    expect(takePick(last)).toMatchObject({ mode: "take", total: 45, cell: 5, busyKey: `bag:${last.key}` });
  });

  it("положить: «Всё» — сколько можно унести, «Ячейку» — не больше этого", () => {
    const [c] = bagCells([item(20)], (n) => n);
    expect(putPick(c, 19)).toMatchObject({ mode: "put", total: 19, cell: 19 });
  });
});

describe("срок на плитке", () => {
  it("часы вниз, последний час — минуты (не меньше одной), сгорело — null", () => {
    expect(leftLabel(5 * H + 59 * 60_000, 0, 0)).toEqual({ key: "bag.left_h", params: { h: 5 } });
    expect(leftLabel(H, 0, 30 * 60_000)).toEqual({ key: "bag.left_m", params: { m: 30 } });
    expect(leftLabel(30_000, 0, 0)).toEqual({ key: "bag.left_m", params: { m: 1 } });
    expect(leftLabel(H, 0, H)).toBeNull();
  });
});
