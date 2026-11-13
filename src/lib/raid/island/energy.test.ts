import { describe, expect, it } from "vitest";
import { energyMultOf, scaleEnergy } from "@/lib/raid/island/energy";

describe("энергия острова", () => {
  it("остров — ×0,1, мир — ×1", () => {
    expect(energyMultOf("isle_abc")).toBe(0.1);
    expect(energyMultOf("rmap_x")).toBe(1);
    expect(energyMultOf(null)).toBe(1);
  });

  it("цена: половина до сотых, бесплатное — 0, платное — не дешевле 0,01", () => {
    expect(scaleEnergy(10, 0.5)).toBe(5);
    expect(scaleEnergy(1.3, 0.5)).toBe(0.65);
    expect(scaleEnergy(0.01, 0.5)).toBe(0.01);
    expect(scaleEnergy(0, 0.5)).toBe(0);
    expect(scaleEnergy(7, 1)).toBe(7);
  });
});
