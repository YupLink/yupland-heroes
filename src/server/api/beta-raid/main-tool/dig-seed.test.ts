// Бросок находки (§8.24 п. 6б): случайный, 0…999, ровный. От ключа нажатия не
// зависит вовсе — присланный снова «кладовый» ключ клада не повторит.
import { describe, expect, it } from "vitest";
import { digRoll } from "./dig-seed";

describe("бросок находки", () => {
  it("0…999, целое; ключа нажатия не принимает", () => {
    expect(digRoll.length).toBe(0);
    for (let i = 0; i < 1000; i++) {
      const r = digRoll();
      expect(Number.isInteger(r) && r >= 0 && r < 1000).toBe(true);
    }
  });

  it("броски ровные: на 20 тысяч каждая сотня — около 10 %", () => {
    const buckets = Array.from({ length: 10 }, () => 0);
    for (let i = 0; i < 20000; i++) buckets[Math.floor(digRoll() / 100)]++;
    for (const b of buckets) expect(Math.abs(b - 2000)).toBeLessThan(250);
  });
});
