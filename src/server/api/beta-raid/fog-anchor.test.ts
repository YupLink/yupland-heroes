// Туман: принимаем только клетки рядом с тем, где герой был (аудит 11.11.2026).
import { describe, expect, it } from "vitest";
import { FOG_ANCHOR_RADIUS, nearAnchors } from "./fog-anchor";

describe("nearAnchors", () => {
  const anchors = [
    { q: 0, r: 0 },
    { q: 200, r: 0 },
  ];
  it("рядом с любой точкой стояния — принимаем (и после портала тоже)", () => {
    expect(nearAnchors(["5,5", "190,3", `${FOG_ANCHOR_RADIUS},0`], anchors)).toEqual([
      "5,5",
      "190,3",
      `${FOG_ANCHOR_RADIUS},0`,
    ]);
  });
  it("далеко от всех точек — отбрасываем («вся карта разом»)", () => {
    expect(nearAnchors(["100,0", "0,500", `${FOG_ANCHOR_RADIUS + 1},0`], anchors)).toEqual([]);
  });
  it("точек нет — ничего; мусор в ключе — мимо", () => {
    expect(nearAnchors(["1,1"], [])).toEqual([]);
    expect(nearAnchors(["x,y", "1"], anchors)).toEqual([]);
  });
});
