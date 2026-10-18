import { describe, expect, it } from "vitest";
import { fenceCamera, fenceInner } from "./fenceCamera";
import { groupBox, hexCenter, HEX_SIZE } from "@/components/castle-editor/hexGeom";
import type { CellMap } from "@/components/castle-editor/types";

const cell = (extra: Record<string, unknown>) => ({ terrainId: "t", ...extra }) as CellMap[string];

// Ограда как на живой карте замка (07.10): верх — ряд 2, низ — ряд 13, бока
// «ёлочкой» через ряд (q 3/4 слева, 10/11 справа), ворота в нижнем ряду.
function castle(): CellMap {
  const m: CellMap = {};
  for (let q = 0; q <= 14; q++) for (let r = 0; r <= 15; r++) m[`${q},${r}`] = cell({});
  for (let q = 5; q <= 10; q++) m[`${q},2`] = cell({ objectId: "fence" });
  const left = [4, 4, 3, 4, 3, 3, 3, 4, 3, 4]; // ряды 3…12
  const right = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11];
  left.forEach((q, i) => (m[`${q},${3 + i}`] = cell({ objectId: "fence" })));
  right.forEach((q, i) => (m[`${q},${3 + i}`] = cell({ objectId: "fence" })));
  for (const q of [4, 5, 9, 10]) m[`${q},13`] = cell({ objectId: "fence" });
  m["7,6"] = cell({ buildingId: "hall" });
  m["7,13"] = cell({ buildingId: "gate" });
  return m;
}

describe("кадр замка — внутри ограды", () => {
  it("бока — по внутреннему зубцу, верх и низ — по рядам ограды", () => {
    const inner = fenceInner(castle())!;
    const left = [4, 4, 3, 4, 3, 3, 3, 4, 3, 4];
    const innerLeft = Math.max(...left.map((q, i) => hexCenter(q, 3 + i)[0]));
    expect(inner.x0).toBeCloseTo(innerLeft, 6);
    expect(inner.y0).toBeCloseTo(hexCenter(5, 2)[1] + HEX_SIZE * 0.5, 6);
    expect(inner.y1).toBeCloseTo(hexCenter(5, 13)[1], 6);
  });

  // С #44/#48 (09.10, Ангелина) кадр — по постройкам с их картинками: они
  // заполняют всю высоту полосы между кнопками, а бока площади — свайпом вбок.
  // Рамка построек фикстуры: ратуша (7,6) и ворота (7,13) — по клетке, запас 8.
  const PAD = 8;
  const hall = groupBox(["7,6"]);
  const gate = groupBox(["7,13"]);
  const scene = {
    x0: Math.min(hall.x, gate.x) - PAD,
    y0: hall.y - PAD,
    x1: Math.max(hall.x + hall.w, gate.x + gate.w) + PAD,
    y1: gate.y + gate.h + PAD,
  };

  it("телефон: постройки — на всю высоту полосы, ворота над ресурсами, ограда — свайпом", () => {
    const top = 64;
    const bottom = 70;
    const cam = fenceCamera(castle(), { hall: "hall", gate: "gates" }, 393, 873, { top, bottom });
    expect(cam.width).toBeGreaterThanOrEqual(393);
    expect(cam.height).toBe(873);
    const [x0, y0, w, h] = cam.viewBox.split(" ").map(Number);
    const k = cam.width / w;
    expect(h * k).toBeCloseTo(873, 6);
    const toScreen = (x: number, y: number) => [(x - x0) * k - cam.scrollLeft, (y - y0) * k];
    const [, sTop] = toScreen(scene.x0, scene.y0);
    const [, sBottom] = toScreen(scene.x1, scene.y1);
    expect(sTop).toBeCloseTo(top, 6);
    expect(sBottom).toBeCloseTo(873 - bottom, 6); // ворота — над полосой ресурсов
    const [cx] = toScreen((scene.x0 + scene.x1) / 2, 0);
    expect(cx).toBeCloseTo(393 / 2, 6); // постройки по центру
    // Площадь целиком на холсте — края достаются свайпом.
    const inner = fenceInner(castle())!;
    expect((inner.x0 - x0) * k).toBeGreaterThanOrEqual(-0.01);
    expect((inner.x1 - x0) * k).toBeLessThanOrEqual(cam.width + 0.01);
    expect(cam.hasGates).toBe(true);
  });

  it("компьютер: постройки по высоте полосы и по центру; вокруг — карта замка", () => {
    const cam = fenceCamera(castle(), {}, 1440, 900, { top: 72, bottom: 72 });
    const [x0, y0, w] = cam.viewBox.split(" ").map(Number);
    const k = cam.width / w;
    const left = (scene.x0 - x0) * k - cam.scrollLeft;
    const right = (scene.x1 - x0) * k - cam.scrollLeft;
    expect(left + right).toBeCloseTo(1440, 6); // по центру
    expect(left).toBeGreaterThan(0);
    expect((scene.y1 - scene.y0) * k).toBeCloseTo(900 - 72 - 72, 6);
    expect((scene.y0 - y0) * k).toBeCloseTo(72, 6);
  });

  it("ограды нет — кадр по постройкам с запасом", () => {
    const m: CellMap = { "3,3": cell({ buildingId: "a" }), "6,6": cell({ buildingId: "b" }) };
    expect(fenceInner(m)).toBeNull();
    expect(fenceCamera(m, {}, 393, 873, { top: 64, bottom: 70 }).width).toBeGreaterThan(0);
  });
});
