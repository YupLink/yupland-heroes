import { describe, expect, it } from "vitest";
import { offsetForAnchor, worldUnder } from "./pinchMode";

describe("щипок под пальцами", () => {
  it("точка карты под пальцем остаётся под пальцем при любом масштабе", () => {
    const W = 393,
      H = 873;
    const off0 = { x: -120, y: 40 };
    const finger0 = { x: 300, y: 700 };
    const w = worldUnder(finger0, off0, 1, W, H);
    // увеличили вдвое и сдвинули пальцы
    const finger1 = { x: 250, y: 650 };
    const off1 = offsetForAnchor(w, finger1, 2, W, H);
    const back = worldUnder(finger1, off1, 2, W, H);
    expect(back.x).toBeCloseTo(w.x, 6);
    expect(back.y).toBeCloseTo(w.y, 6);
  });
});
