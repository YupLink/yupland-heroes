// Карта мира на телефоне: ответ → модель, местность → пиксели картинки.
import { describe, expect, it } from "vitest";
import { encodeRuns, WORLD_MARK_KINDS, type WorldMapWire } from "@/lib/raid/worldMapCodec";
import { cellValue, paintTerrain, worldMapModel } from "./worldMapModel";

/** Рамка q 0..2, r 0..1: строка r=0 — 1,1,0; строка r=1 — 2,0,1. */
const WIRE: WorldMapWire = {
  mode: "seen",
  q0: 0,
  r0: 0,
  cols: 3,
  rows: 2,
  terrains: [
    { id: "a", name: "Трава", img: null },
    { id: "b", name: "Вода", img: null },
  ],
  runs: encodeRuns(new Uint16Array([1, 1, 0, 2, 0, 1])),
  // Клад (3) — и за рамкой: свой, сервер ставит его мимо тумана.
  marks: [0, 1, 0, 2, 2, 1, 99, 5, 5, 3, 7, -4],
};

describe("worldMapModel", () => {
  it("рамка, счёт клеток по местности и метки", () => {
    const m = worldMapModel(WIRE)!;
    expect(m.counts).toEqual([0, 3, 1]);
    expect(cellValue(m, 1, 0)).toBe(1);
    expect(cellValue(m, 2, 0)).toBe(0);
    expect(cellValue(m, 0, 1)).toBe(2);
    expect(cellValue(m, 5, 5)).toBe(0); // за рамкой
    // Вид 99 неизвестен (ответ новее клиента) — пропускаем, а не рисуем чем попало.
    expect(m.marks).toEqual([
      { kind: "mine", q: 1, r: 0 },
      { kind: "town", q: 2, r: 1 },
      { kind: "treasure", q: 7, r: -4 },
    ]);
  });

  it("постройки всех поведений читаются по номеру вида из кодека", () => {
    const P = WORLD_MARK_KINDS.indexOf("portal");
    const O = WORLD_MARK_KINDS.indexOf("other");
    const m = worldMapModel({ ...WIRE, marks: [P, 1, 0, O, 0, 1] })!;
    expect(m.marks).toEqual([
      { kind: "portal", q: 1, r: 0 },
      { kind: "other", q: 0, r: 1 },
    ]);
  });

  it("картинка: клетка — два пикселя, соседняя строка сдвинута на один", () => {
    const m = worldMapModel(WIRE)!;
    // hx = 2q + r: (0,0)→0, (1,0)→2, (0,1)→1, (2,1)→5 → ширина 5 − 0 + 2.
    expect([m.hxMin, m.imgW, m.imgH]).toEqual([0, 7, 2]);
    const palette = new Uint8Array([0, 0, 0, 10, 20, 30, 40, 50, 60]);
    const px = new Uint8ClampedArray(m.imgW * m.imgH * 4);
    paintTerrain(m, palette, px);
    const rgba = (x: number, y: number) =>
      Array.from(px.slice((y * m.imgW + x) * 4, (y * m.imgW + x) * 4 + 4));
    // Строка 0: (0,0) → пиксели 0–1, (1,0) → 2–3; дальше пусто.
    expect(rgba(0, 0)).toEqual([10, 20, 30, 255]);
    expect(rgba(3, 0)).toEqual([10, 20, 30, 255]);
    expect(rgba(4, 0)).toEqual([0, 0, 0, 0]);
    // Строка 1 сдвинута на пиксель: (0,1) → 1–2, (2,1) → 5–6.
    expect(rgba(0, 1)).toEqual([0, 0, 0, 0]);
    expect(rgba(1, 1)).toEqual([40, 50, 60, 255]);
    expect(rgba(2, 1)).toEqual([40, 50, 60, 255]);
    expect(rgba(6, 1)).toEqual([10, 20, 30, 255]);
  });

  it("битые бега — null; пустая разведка — пустая картинка", () => {
    expect(worldMapModel({ ...WIRE, cols: 4 })).toBeNull();
    const empty = worldMapModel({ ...WIRE, cols: 0, rows: 0, runs: "", marks: [] })!;
    expect([empty.imgW, empty.imgH]).toEqual([0, 0]);
  });
});
