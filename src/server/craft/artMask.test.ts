// Снятие фона: белое поле, отдельная тень, рамка и белое внутри предмета.
import { describe, expect, it } from "vitest";
import { itemMask, maskProblem } from "./artMask";

const W = 100;
const H = 100;

/** Белый холст и рисовалка прямоугольников. */
function canvas() {
  const rgb = new Uint8Array(W * H * 3).fill(255);
  const rect = (x0: number, y0: number, x1: number, y1: number, c: number[]) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) rgb.set(c, (y * W + x) * 3);
  };
  return { rgb, rect };
}

const at = (m: Uint8Array, x: number, y: number) => m[y * W + x];

describe("снятие фона", () => {
  it("предмет в тёмном контуре остаётся целиком, с белым внутри", () => {
    const { rgb, rect } = canvas();
    rect(30, 30, 60, 60, [20, 20, 20]); // контур
    rect(32, 32, 58, 58, [200, 40, 40]); // тело
    rect(40, 40, 50, 50, [255, 255, 255]); // белый блик внутри — ровно цвет фона
    const m = itemMask(rgb, W, H);
    expect(at(m.mask, 45, 45)).toBe(1);
    expect(at(m.mask, 40, 40)).toBe(1);
    expect(at(m.mask, 10, 10)).toBe(0);
    expect(m.box).toEqual({ x: 30, y: 30, w: 31, h: 31 });
    expect(maskProblem(m)).toBeNull();
  });

  it("светло-серая тень и рамка через всю картинку уходят", () => {
    const { rgb, rect } = canvas();
    rect(30, 20, 60, 60, [20, 20, 20]);
    rect(32, 22, 58, 58, [60, 120, 200]);
    rect(30, 70, 60, 74, [190, 190, 196]); // тень под предметом
    rect(2, 2, 97, 2, [120, 120, 120]); // верх рамки
    rect(2, 97, 97, 97, [120, 120, 120]); // низ рамки
    const m = itemMask(rgb, W, H);
    expect(at(m.mask, 45, 72)).toBe(0);
    expect(at(m.mask, 50, 2)).toBe(0);
    expect(m.box).toEqual({ x: 30, y: 20, w: 31, h: 41 });
  });

  it("неровный фон, обрезанный и пустой — брак", () => {
    const noisy = canvas();
    for (let i = 0; i < W * H; i += 2) noisy.rgb.set([0, 0, 0], i * 3);
    expect(maskProblem(itemMask(noisy.rgb, W, H))).toBe("bg_not_plain");

    const cut = canvas();
    cut.rect(0, 30, 40, 60, [30, 30, 30]);
    expect(maskProblem(itemMask(cut.rgb, W, H))).toBe("cut_off");

    expect(maskProblem(itemMask(canvas().rgb, W, H))).toBe("empty");
  });
});

describe("длинное оружие по диагонали", () => {
  it("тонкое копьё через почти всю картинку — предмет, а не рамка", () => {
    const { rgb } = canvas();
    for (let t = 6; t <= 93; t++) {
      for (let d = -2; d <= 2; d++) {
        const x = t + d;
        const y = 99 - t;
        if (x >= 0 && x < W) rgb.set([90, 60, 30], (y * W + x) * 3);
      }
    }
    const m = itemMask(rgb, W, H);
    expect(maskProblem(m)).toBeNull();
    expect(m.box?.w).toBeGreaterThan(85);
  });
});

describe("дыры", () => {
  it("у кольца фон сквозь дыру снимается, затенённое белое остаётся", () => {
    const { rgb, rect } = canvas();
    rect(20, 20, 80, 80, [30, 25, 20]); // кольцо: тёмный обод
    rect(30, 30, 70, 70, [255, 255, 255]); // дыра — ровно цвет фона
    expect(at(itemMask(rgb, W, H).mask, 50, 50)).toBe(1); // форма без дыр — белое остаётся
    const ring = itemMask(rgb, W, H, true);
    expect(at(ring.mask, 50, 50)).toBe(0);
    expect(at(ring.mask, 22, 50)).toBe(1);

    const fur = canvas();
    fur.rect(20, 20, 80, 80, [30, 25, 20]);
    for (let y = 30; y <= 70; y++)
      for (let x = 30; x <= 70; x++) fur.rgb.set([240 + ((x + y) % 10), 238, 232], (y * W + x) * 3);
    expect(at(itemMask(fur.rgb, W, H, true).mask, 50, 50)).toBe(1);
  });
});

describe("россыпь после дыр", () => {
  it("тонкое кольцо с дырой и куски рядом — россыпь, доли после дыр", () => {
    const { rgb, rect } = canvas();
    rect(10, 10, 40, 40, [30, 25, 20]);
    rect(13, 13, 37, 37, [255, 255, 255]); // дыра: от кольца остаётся тонкий обод
    rect(55, 10, 75, 30, [200, 40, 40]);
    rect(55, 50, 75, 69, [40, 200, 40]);
    rect(10, 60, 29, 78, [40, 40, 200]); // четыре сравнимых куска — россыпь
    const m = itemMask(rgb, W, H, true);
    expect(m.main).toBeLessThanOrEqual(1);
    expect(maskProblem(m)).toBe("scattered");
  });
});

describe("пара", () => {
  it("два одинаковых куска (наручи, сапоги) — предмет, а не россыпь", () => {
    const { rgb, rect } = canvas();
    rect(15, 30, 40, 70, [90, 60, 30]);
    rect(55, 30, 80, 70, [90, 60, 30]);
    expect(maskProblem(itemMask(rgb, W, H))).toBeNull();
  });
});

describe("тень", () => {
  it("серая тень у предмета снимается, сталь в тёмной обводке остаётся", () => {
    const { rgb, rect } = canvas();
    rect(30, 20, 70, 60, [20, 20, 20]); // обводка
    rect(32, 22, 68, 58, [150, 152, 158]); // сталь — серая, но внутри обводки
    rect(25, 61, 75, 70, [110, 112, 116]); // тень вплотную под предметом
    const m = itemMask(rgb, W, H);
    expect(at(m.mask, 50, 40)).toBe(1);
    expect(at(m.mask, 50, 66)).toBe(0);
    expect(m.box).toEqual({ x: 30, y: 20, w: 41, h: 41 });
  });
});
