// Сытость на острове новичка — в 10 раз меньше (владелец, 21.10.2026).
import { describe, expect, it } from "vitest";
import { SATIETY_COST } from "@/lib/hero/satiety";
import { ISLAND_SATIETY_MULT, satietyMultOf, scaleSatiety } from "./satiety";

describe("сытость острова", () => {
  it("остров — 0,1, мир — 1", () => {
    expect(ISLAND_SATIETY_MULT).toBe(0.1);
    expect(satietyMultOf("isle_abc")).toBe(0.1);
    expect([satietyMultOf("rmap_x"), satietyMultOf(null)]).toEqual([1, 1]);
  });

  it("шаг 0,1, вода 0,2, бой 1, рубка руками 3; в мире — как было", () => {
    const m = satietyMultOf("isle_abc");
    expect(scaleSatiety(SATIETY_COST.step, m)).toBe(0.1);
    expect(scaleSatiety(SATIETY_COST.water, m)).toBe(0.2);
    expect(scaleSatiety(SATIETY_COST.fight, m)).toBe(1);
    expect(scaleSatiety(SATIETY_COST.handChop, m)).toBe(3);
    expect(scaleSatiety(SATIETY_COST.fight, 1)).toBe(10);
    expect(scaleSatiety(0, m)).toBe(0);
  });
});
