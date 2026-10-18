// Арифметика сети магического сундука: место, штуки с мобов, выбор грабителя.
import { describe, expect, it } from "vitest";
import { clampPicks, collectedUnits, netRoomFor, netUsed } from "@/lib/magicChest";

const slot = (stackKey: string, count: number) => ({
  stackKey,
  kind: "custom",
  name: stackKey,
  image: null,
  count,
});

describe("сеть сундука", () => {
  it("занятость — ячейками по 20, дробный хвост занимает целую", () => {
    expect(netUsed([slot("a", 20), slot("b", 0.5), slot("c", 21)])).toBe(4);
  });

  it("место под вид = хвост своей ячейки + свободные ячейки", () => {
    const slots = [slot("a", 15), slot("b", 40)];
    expect(netRoomFor(slots, "a")).toBe(5 + 7 * 20);
    expect(netRoomFor(slots, "z")).toBe(7 * 20);
  });

  it("полная сеть принимает только долив в свою ячейку", () => {
    const full = Array.from({ length: 10 }, (_, i) => slot(`k${i}`, i === 0 ? 12 : 20));
    expect(netRoomFor(full, "k0")).toBe(8);
    expect(netRoomFor(full, "new")).toBe(0);
  });
});

describe("собранные штуки", () => {
  it("не больше, чем лежит: купленное уходит первым", () => {
    expect(collectedUnits(5, 10)).toBe(5);
    expect(collectedUnits(10, 3)).toBe(3);
    expect(collectedUnits(4, -1)).toBe(0);
  });
});

describe("выбор грабителя", () => {
  it("урезается до того, что осталось в сети", () => {
    const got = clampPicks(
      [
        { stackKey: "a", qty: 30 },
        { stackKey: "b", qty: 5 },
        { stackKey: "gone", qty: 3 },
      ],
      [slot("a", 12), slot("b", 20)],
    );
    expect(got).toEqual([
      { stackKey: "a", qty: 12 },
      { stackKey: "b", qty: 5 },
    ]);
  });

  it("повтор вида в выборе не берёт больше, чем лежит", () => {
    const got = clampPicks(
      [
        { stackKey: "a", qty: 8 },
        { stackKey: "a", qty: 8 },
      ],
      [slot("a", 10)],
    );
    expect(got.reduce((s, p) => s + p.qty, 0)).toBe(10);
  });
});
