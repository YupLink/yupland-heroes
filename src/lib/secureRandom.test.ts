// Криптослучай: в пределах, равномерно по грубой проверке, широкие диапазоны.
import { describe, expect, it } from "vitest";
import { secureRandomInt } from "./secureRandom";

describe("secureRandomInt", () => {
  it("в пределах [min, max), включая диапазон шире 2^32", () => {
    for (let i = 0; i < 2000; i++) {
      const a = secureRandomInt(10, 31);
      expect(a).toBeGreaterThanOrEqual(10);
      expect(a).toBeLessThan(31);
      const b = secureRandomInt(0, 5_000_000_000);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(5_000_000_000);
    }
  });

  it("пустой диапазон — min; все значения выпадают", () => {
    expect(secureRandomInt(7, 7)).toBe(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(secureRandomInt(0, 4));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });
});
