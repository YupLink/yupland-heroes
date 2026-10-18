// Часы турниров идут по границе минуты (+2 с): старт по расписанию в 00:00
// случается в 00:00:02, а не «через минуту от первого чтения подарков».
import { describe, expect, it } from "vitest";
import { msToNextTick } from "./tour-tick";

const at = (iso: string) => Date.parse(iso);

describe("проход часов — на границе минуты", () => {
  it("ближайший проход — :02 этой или следующей минуты", () => {
    expect(msToNextTick(at("2026-10-04T23:59:30.000Z"))).toBe(32_000);
    expect(msToNextTick(at("2026-10-05T00:00:01.000Z"))).toBe(1_000);
    expect(msToNextTick(at("2026-10-05T00:00:02.000Z"))).toBe(60_000);
    expect(msToNextTick(at("2026-10-05T00:00:02.500Z"))).toBe(59_500);
  });

  it("задержка всегда в (0, 60 с]", () => {
    for (let ms = 0; ms < 120_000; ms += 137) {
      const d = msToNextTick(at("2026-10-05T00:00:00.000Z") + ms);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThanOrEqual(60_000);
    }
  });
});
