// Камера карты мира: тап попадает ровно в ту клетку, что нарисована под ним.
import { describe, expect, it } from "vitest";
import {
  cellAt,
  cellWorld,
  clampCam,
  fitCam,
  KX,
  nearestTarget,
  toScreen,
  zoomAt,
  type Cam,
} from "./worldMapCamera";

const GEO = { hxMin: -236, r0: -145 };

describe("worldMapCamera", () => {
  it("центр любой клетки на экране — та же клетка при любом зуме", () => {
    const cams: Cam[] = [
      { s: 0.7, ox: 12, oy: -40 },
      { s: 3, ox: -500, oy: 210 },
      { s: 38, ox: -9000, oy: -4000 },
    ];
    for (const cam of cams) {
      for (let q = -190; q <= 255; q += 37) {
        for (let r = -145; r <= 199; r += 29) {
          const p = toScreen(cam, cellWorld(GEO, q, r));
          expect(cellAt(cam, GEO, p.x, p.y)).toEqual({ q, r });
        }
      }
    }
  });

  it("соседи по строке отстоят на ширину гекса, строки — на 3/4 её по высоте", () => {
    const a = cellWorld(GEO, 10, 4);
    const b = cellWorld(GEO, 11, 4);
    const c = cellWorld(GEO, 10, 5);
    expect(b.x - a.x).toBeCloseTo(2 * KX);
    // Пропорции настоящего гекса: шаг по строке √3·R, между строками 1,5·R.
    expect((b.x - a.x) / (c.y - a.y)).toBeCloseTo(Math.sqrt(3) / 1.5);
    expect(c.x - a.x).toBeCloseTo(KX);
  });

  it("зум держит точку под пальцем на месте", () => {
    const cam: Cam = { s: 2, ox: 30, oy: -15 };
    const before = { x: (140 - cam.ox) / cam.s, y: (260 - cam.oy) / cam.s };
    const z = zoomAt(cam, 5, 140, 260);
    expect(z.s).toBe(5);
    expect(toScreen(z, before).x).toBeCloseTo(140);
    expect(toScreen(z, before).y).toBeCloseTo(260);
  });

  it("вписывание: рамка по центру и не крупнее потолка", () => {
    const box = { x0: 0, y0: 0, x1: 100, y1: 50 };
    const cam = fitCam(box, 400, 300, 10, 99);
    expect(cam.s).toBeCloseTo(3.8);
    const mid = toScreen(cam, { x: 50, y: 25 });
    expect(mid.x).toBeCloseTo(200);
    expect(mid.y).toBeCloseTo(150);
    expect(fitCam({ x0: 0, y0: 0, x1: 2, y1: 2 }, 400, 300, 10, 16).s).toBe(16);
  });

  it("карту нельзя утащить за край целиком", () => {
    const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const gone = clampCam({ s: 1, ox: -5000, oy: 9000 }, box, 400, 300, 48);
    expect(gone.ox + 100).toBe(48); // правый край карты — в 48 px от левого края экрана
    expect(gone.oy).toBe(300 - 48); // верх карты — в 48 px от низа экрана
    const ok: Cam = { s: 1, ox: 10, oy: 10 };
    expect(clampCam(ok, box, 400, 300, 48)).toBe(ok);
  });

  it("тап рядом с меткой — это тап по метке, далеко — мимо", () => {
    const cam: Cam = { s: 2, ox: 0, oy: 0 };
    const targets = [
      { x: 10, y: 10, id: "a" },
      { x: 40, y: 10, id: "b" },
    ];
    expect(nearestTarget(cam, targets, 75, 25, 22)?.id).toBe("b");
    expect(nearestTarget(cam, targets, 200, 200, 22)).toBeNull();
  });
});
