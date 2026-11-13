// Камера у края разведанного (тестер, 26.10.2026): верхний ряд можно опустить ниже
// верхней панели — запас за краем = пара гексов + 35 % высоты экрана (по ширине — 30 %).
import { describe, expect, it } from "vitest";
import { R, axialToPixel } from "./hexGeometry";
import { EDGE_SLACK_X, EDGE_SLACK_Y, clampToBounds } from "./viewportClamp";

const W = 393;
const H = 873;
const bounds = { minQ: 0, maxQ: 40, minR: 0, maxR: 40 };

describe("камера у края разведанного", () => {
  it("верхний ряд встаёт на запас от верха экрана, дальше — нет", () => {
    const top = axialToPixel(20, 0, 20, 0);
    // Просим поставить верхний ряд в центр экрана — клэмп пустит только до запаса.
    const want = { x: -top.x, y: -top.y };
    const got = clampToBounds(want, 1, bounds, 20, 0, W, H);
    const ys = [0, 40].flatMap((r) => [0, 40].map((q) => axialToPixel(q, r, 20, 0).y));
    const edge = H / 2 + got.y + Math.min(...ys);
    expect(edge).toBeCloseTo(R * 2 + H * EDGE_SLACK_Y, 5);
    expect(edge).toBeGreaterThan(300); // ниже верхней панели (~130 px) и плашки «Идти» над героем
  });

  it("по ширине запас — 30 % экрана", () => {
    const got = clampToBounds({ x: 1e6, y: 0 }, 1, bounds, 20, 0, W, H);
    const xs = [0, 40].flatMap((r) => [0, 40].map((q) => axialToPixel(q, r, 20, 0).x));
    expect(W / 2 + got.x + Math.min(...xs)).toBeCloseTo(R * 2 + W * EDGE_SLACK_X, 5);
  });
});
