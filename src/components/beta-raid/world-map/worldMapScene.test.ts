// Тап по карте мира: метка рядом притягивает, местность — выбирается,
// пустота (неразведанное, за краем) — ничего не делает. Выключенный в легенде
// вид не рисуется и тап не притягивает; клад вне картинки раздвигает рамку.
import { describe, expect, it } from "vitest";
import { encodeRuns, type WorldMapWire } from "@/lib/raid/worldMapCodec";
import { cellWorld, toScreen, type Cam } from "./worldMapCamera";
import { worldMapModel } from "./worldMapModel";
import { pickCell, sceneOf, visibleScene } from "./worldMapScene";

// Строка r=0: q 0..3 — местность, кроме q=2; шахта на (3,0).
const WIRE: WorldMapWire = {
  mode: "seen",
  q0: 0,
  r0: 0,
  cols: 4,
  rows: 1,
  terrains: [{ id: "a", name: "Трава", img: null }],
  runs: encodeRuns(new Uint16Array([1, 1, 0, 1])),
  marks: [0, 3, 0],
};
const MODEL = worldMapModel(WIRE)!;
const CAM: Cam = { s: 30, ox: 10, oy: 10 };
const screenOf = (q: number, r: number) => toScreen(CAM, cellWorld(MODEL, q, r));

describe("worldMapScene", () => {
  const scene = sceneOf(MODEL, { q: 0, r: 0 }, { q: 1, r: 0 });

  it("рамка — по картинке, метки, герой и замок — в мировых точках", () => {
    expect(scene.box.y1).toBe(1);
    expect(scene.marks).toHaveLength(1);
    expect(scene.targets).toHaveLength(3);
  });

  it("тап по клетке с местностью — её координаты", () => {
    const p = screenOf(1, 0);
    // Замок стоит на (1,0) — тап по нему притягивается к нему же.
    expect(pickCell(scene, MODEL, CAM, p.x, p.y, 22)).toEqual({ q: 1, r: 0 });
    const bare = sceneOf(MODEL, null, { q: 9, r: 9 });
    expect(pickCell(bare, MODEL, CAM, p.x, p.y, 22)).toEqual({ q: 1, r: 0 });
  });

  it("тап рядом с меткой — клетка метки; в пустоту — null", () => {
    const m = screenOf(3, 0);
    expect(pickCell(scene, MODEL, CAM, m.x + 12, m.y + 8, 22)).toEqual({ q: 3, r: 0 });
    const bare = sceneOf(MODEL, null, { q: 9, r: 9 });
    const hole = screenOf(2, 0);
    expect(pickCell({ ...bare, targets: [] }, MODEL, CAM, hole.x, hole.y, 22)).toBeNull();
    expect(pickCell(bare, null, CAM, hole.x, hole.y, 22)).toBeNull();
  });
});

describe("visibleScene", () => {
  const scene = sceneOf(MODEL, { q: 0, r: 0 }, { q: 1, r: 0 });

  it("всё включено — та же сцена", () => {
    expect(visibleScene(scene, new Set())).toBe(scene);
  });

  it("выключенный вид не рисуется и не притягивает тап; рамка прежняя", () => {
    const v = visibleScene(scene, new Set(["mine"]));
    expect(v.marks).toEqual([]);
    expect(v.targets).toHaveLength(2);
    expect(v.box).toBe(scene.box);
    // Шахта на клетке без местности: видна — тап к ней, спрятана — в пустоту.
    const m = worldMapModel({ ...WIRE, marks: [0, 2, 0] })!;
    const s = sceneOf(m, null, { q: 9, r: 9 });
    const p = screenOf(2, 0);
    expect(pickCell(s, m, CAM, p.x, p.y, 22)).toEqual({ q: 2, r: 0 });
    expect(pickCell(visibleScene(s, new Set(["mine"])), m, CAM, p.x, p.y, 22)).toBeNull();
  });

  it("герой и замок выключаются так же", () => {
    const v = visibleScene(scene, new Set(["hero", "castle"]));
    expect([v.hero, v.castle]).toEqual([null, null]);
    expect(v.marks).toHaveLength(1);
    expect(v.targets).toEqual(v.marks);
  });
});

describe("клады в рамке", () => {
  it("клад за краем картинки раздвигает рамку, внутри — не трогает", () => {
    const far = worldMapModel({ ...WIRE, marks: [3, 10, 0] })!;
    const s = sceneOf(far, null, { q: 1, r: 0 });
    expect(s.box.x1).toBeCloseTo(cellWorld(far, 10, 0).x);
    expect(s.box.y1).toBe(1);
    const near = worldMapModel({ ...WIRE, marks: [3, 1, 0] })!;
    expect(sceneOf(near, null, { q: 1, r: 0 }).box).toEqual(scene0().box);
  });

  it("пустая разведка — рамка и вокруг клада", () => {
    const empty = worldMapModel({ ...WIRE, cols: 0, rows: 0, runs: "", marks: [3, 40, 5] })!;
    const s = sceneOf(empty, null, { q: 0, r: 0 });
    const t = cellWorld(empty, 40, 5);
    expect(s.box.x1).toBeCloseTo(t.x + 6);
    expect(s.box.y1).toBeCloseTo(t.y + 6);
  });
});

function scene0() {
  return sceneOf(MODEL, null, { q: 1, r: 0 });
}
