// Обычный сундук на канвасе (§8.22): той же картинкой товара, что и
// магический, но без флажка хозяина (хозяина нет) и без охраны; издалека —
// квадрат своего цвета. Без свечений и без save/restore.
import { describe, expect, it } from "vitest";
import { drawMagicChest } from "@/components/beta-raid/chest/drawMagicChest";
import type { DrawScene } from "@/components/beta-raid/betaCanvasScene";
import type { SceneCell } from "@/components/beta-raid/mapIndex";
import { flagCacheKey } from "@/lib/gameArt";

type Call = [string, ...unknown[]];

function fakeScene(scale: number) {
  const calls: Call[] = [];
  const g = new Proxy(
    {},
    {
      get:
        (_t, k: string) =>
        (...a: unknown[]) =>
          void calls.push([k, ...a]),
      set: (_t, k: string, val: unknown) => {
        calls.push([`set:${k}`, val]);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const img = { complete: true, naturalWidth: 100, naturalHeight: 80 };
  const drawn: string[] = [];
  const scene = {
    g,
    scale,
    images: new Map<string, unknown>([
      ["mc:/box.png", img],
      [flagCacheKey("green"), img],
      [flagCacheKey("red"), img],
    ]),
    bucket: 1,
    mineGuards: { "1,2": { name: "Тролль", image: "/t.png" } },
    sprites: {
      get: (key: string) => ({ img: key, w: 10, h: 10, last: 0 }),
      drawBottom: (_g: unknown, s: { img: string }) => void drawn.push(s.img),
      draw: (_g: unknown, s: { img: string }) => void drawn.push(s.img),
    },
  } as unknown as DrawScene;
  return { scene, calls, drawn };
}

const cell = { x: 0, y: 0, key: "1,2" } as unknown as SceneCell;
const plain = { mine: false, plain: true, image: "/box.png", name: "Сундук" };

describe("обычный сундук на карте", () => {
  it("вблизи — картинка товара, без флажка и без охраны", () => {
    const { scene, calls, drawn } = fakeScene(1);
    drawMagicChest(scene, cell, plain, true);
    expect(drawn).toEqual(["mc:/box.png"]);
    // Флажок рисуется drawImage прямо в кадр — у обычного сундука его нет.
    expect(calls.filter(([k]) => k === "drawImage")).toHaveLength(0);
    expect(calls.some(([k]) => k === "save" || k === "set:shadowBlur" || k === "set:filter")).toBe(false);
    // Охранник на клетке есть в слое, но у обычного сундука его не рисуем.
    expect(calls.some(([k]) => k === "arc")).toBe(false);
  });

  it("издалека — квадрат своего цвета с тёмной рамкой, видно всегда", () => {
    const { scene, calls } = fakeScene(0.3);
    drawMagicChest(scene, cell, plain, true);
    expect(calls).toContainEqual(["set:fillStyle", "#8a6a3c"]);
    expect(calls).toContainEqual(["set:strokeStyle", "#2e1b0c"]);
    expect(calls.some(([k]) => k === "fillRect")).toBe(true);
  });

  it("магический — как был: флажок хозяина вблизи и цвет рамки «свой» издалека", () => {
    const near = fakeScene(1);
    drawMagicChest(near.scene, cell, { mine: true, image: "/box.png", name: "МС" }, false);
    expect(near.calls.filter(([k]) => k === "drawImage")).toHaveLength(1);
    const far = fakeScene(0.3);
    drawMagicChest(far.scene, cell, { mine: true, image: "/box.png", name: "МС" }, false);
    expect(far.calls).toContainEqual(["set:strokeStyle", "#37d67a"]);
  });
});
