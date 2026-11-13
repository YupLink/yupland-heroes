// Барабан едет плавно: без скачков положения и скорости, встаёт ровно на целый ряд,
// по очереди слева направо; ожидание — дольше и медленнее.
import { describe, expect, it } from "vitest";
import { BOUNCE_MS, OVERSHOOT, planStop, positionAt } from "./reelMotion";
import { ANTICIPATION_MS, reelTiming } from "./timing";

function trace(plan: ReturnType<typeof planStop>, reel: number) {
  const xs: number[] = [];
  for (let t = 0; t <= plan.landedAt + 50; t += 4) xs.push(positionAt(t, reel, plan).x);
  return xs;
}

describe("движение барабана", () => {
  for (const [grid, label] of [
    [null, "без ожидания"],
    ["ant", "с ожиданием"],
  ] as const) {
    it(`плавно и точно (${label}), итог пришёл через 0…400 мс`, () => {
      for (const g of [0, 120, 400]) {
        for (let reel = 0; reel < 5; reel++) {
          const anticipate = grid === "ant" && reel >= 2;
          const stops = reelTiming(null).stops.map(
            (s, i) => s + (anticipate && i >= 2 ? ANTICIPATION_MS * (i - 1) : 0),
          );
          const plan = planStop(reel, g, stops[reel], anticipate, ANTICIPATION_MS);
          expect(Number.isInteger(plan.end)).toBe(true);
          expect(plan.brakeAt).toBeGreaterThanOrEqual(g - 1e-9);
          const xs = trace(plan, reel);
          // ни скачков (шаг 4 мс ≤ 0,1 ряда), ни движения назад, кроме отскока
          for (let i = 1; i < xs.length; i++) expect(Math.abs(xs[i] - xs[i - 1])).toBeLessThan(0.1);
          const peakIdx = Math.ceil(plan.stopAt / 4);
          for (let i = 1; i < Math.min(peakIdx, xs.length); i++)
            expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] - 1e-9);
          expect(positionAt(plan.stopAt, reel, plan).x).toBeCloseTo(plan.end + OVERSHOOT, 6);
          expect(positionAt(plan.landedAt + 1, reel, plan).x).toBe(plan.end);
          expect(plan.landedAt - plan.stopAt).toBeCloseTo(BOUNCE_MS, 6);
          // встаёт примерно тогда, когда велит timing.ts (подгонка до целого ряда — ≤ 25 мс)
          expect(Math.abs(plan.stopAt - (g + stops[reel]))).toBeLessThan(26);
        }
      }
    });
  }

  it("барабаны встают по очереди слева направо", () => {
    const stops = reelTiming(null).stops;
    const plans = stops.map((s, reel) => planStop(reel, 200, s, false, ANTICIPATION_MS));
    for (let i = 1; i < 5; i++) expect(plans[i].stopAt).toBeGreaterThan(plans[i - 1].stopAt + 200);
  });
});
