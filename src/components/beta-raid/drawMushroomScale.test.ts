// Гриб на карте втрое меньше (владелец, 22.10.2026: «грибы сделать в 3 раза
// меньше — а то сейчас видно очень издалека»): любой облик гриба (skin:
// bskin_dm_*) — раскиданный, посаженный, появившийся — рисуется шириной в треть
// обычной постройки; прочие постройки — как были. Клетка та же.
import { describe, expect, it } from "vitest";
import { drawBuilding } from "./drawBuilding";
import { R } from "./hexGeometry";
import type { DrawScene } from "./betaCanvasScene";
import type { SceneCell } from "./mapIndex";

/** Сцена-заглушка: картинка 100×100 загружена, спрайтов нет (крупный бакет). */
function sceneFor(key: string) {
  const calls: number[][] = [];
  const g = {
    drawImage: (...a: unknown[]) => calls.push(a.slice(1).map(Number)),
    fillRect: () => {},
    strokeRect: () => {},
  };
  const img = { complete: true, naturalWidth: 100, naturalHeight: 100 };
  const scene = {
    g,
    images: new Map([[`b:${key}:0`, img]]),
    buildingTiers: {},
    bucket: 99,
  } as unknown as DrawScene;
  return { scene, calls };
}

const cell = { key: "3,4", x: 100, y: 100 } as unknown as SceneCell;

describe("гриб на карте — втрое меньше", () => {
  it("облик гриба любого вида — ширина R·1,7/3", () => {
    for (const key of ["skin:bskin_dm_mushroom", "skin:bskin_dm_gold", "skin:bskin_dm_diamonds"]) {
      const { scene, calls } = sceneFor(key);
      drawBuilding(scene, cell, key);
      const [, , w, h] = calls[calls.length - 1];
      expect(w).toBeCloseTo((R * 1.7) / 3);
      expect(h).toBeCloseTo((R * 1.7) / 3);
    }
  });

  it("прочая постройка — прежняя ширина R·1,7", () => {
    const { scene, calls } = sceneFor("building_3arAnV9ajZ");
    drawBuilding(scene, cell, "building_3arAnV9ajZ");
    const [, , w] = calls[calls.length - 1];
    expect(w).toBeCloseTo(R * 1.7);
  });
});
