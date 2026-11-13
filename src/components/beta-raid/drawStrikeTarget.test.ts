// Дерево под ударом — размером как на карте: одиночное — на клетку, декор
// объединённого блока (лес на две клетки) — на весь блок, как drawBlock.
import { describe, expect, it, vi } from "vitest";
import type { MapStore } from "./mapStore";

const draw = vi.fn();
const block = vi.fn();
vi.mock("./drawDecoration", () => ({ drawDecoration: (...a: unknown[]) => draw(...a) }));
vi.mock("./mergeBlocks", () => ({ blockAt: (...a: unknown[]) => block(...a) }));

const { drawStrikeTarget } = await import("./drawStrikeTarget");

const scene = { g: {}, images: new Map(), toPixel: () => ({ x: 10, y: 20 }) } as never;
const decor: Record<number, string> = {};
const store = { index: () => 7, decorationId: (j: number) => decor[j] } as unknown as MapStore;
const hit = { q: 1, r: 2, decorId: "forest" };

describe("drawStrikeTarget", () => {
  it("одиночная клетка — как раньше, на клетку", () => {
    draw.mockClear();
    block.mockReturnValue(null);
    drawStrikeTarget(scene, store, hit);
    expect(draw).toHaveBeenCalledWith(scene, { x: 10, y: 20 }, "forest");
  });

  it("клетка блока — на весь блок, тем же размером, что drawBlock", () => {
    draw.mockClear();
    block.mockReturnValue({ cells: [7, 8], minX: 0, maxX: 170, yLow: 50, scale: 1 });
    drawStrikeTarget(scene, store, hit);
    expect(draw).toHaveBeenCalledWith(scene, { x: 85, y: 50 }, "forest", 150);
  });

  it("клетка блока, чей декор карта не показывает, — своей картинки нет", () => {
    draw.mockClear();
    decor[3] = "rock";
    block.mockReturnValue({ cells: [3, 7], minX: 0, maxX: 170, yLow: 50, scale: 1 });
    drawStrikeTarget(scene, store, hit);
    expect(draw).not.toHaveBeenCalled();
    delete decor[3];
  });

  it("карты нет — на клетку", () => {
    draw.mockClear();
    drawStrikeTarget(scene, null, hit);
    expect(draw).toHaveBeenCalledWith(scene, { x: 10, y: 20 }, "forest");
  });
});
