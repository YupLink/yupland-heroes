// Тесты шума генератора зон: `bun run test`.
//
// Главное здесь — повторяемость: превью на клиенте и запись на сервере
// считают шум независимо, и расхождение в одном знаке — это разные карты.
import { describe, expect, it } from "vitest";
import { fbm, hexToXY, makeNoise, mulberry32, warpedFbm } from "@/lib/raid/zonegen/noise";

const ok = (cond: boolean, msg: string): void => {
  expect(cond, msg).toBe(true);
};
const near = (a: number, b: number, tol: number, msg: string) =>
  ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (допуск ${tol})`);

const grid = (step: number, from: number, to: number): Array<[number, number]> => {
  const pts: Array<[number, number]> = [];
  for (let x = from; x < to; x += step) for (let y = from; y < to; y += step) pts.push([x, y]);
  return pts;
};

describe("mulberry32", () => {
  it("один сид — та же последовательность, значения в [0, 1)", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      ok(v >= 0 && v < 1, `выход за [0,1): ${v}`);
    }
  });

  it("разные сиды — разные последовательности", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const same = Array.from({ length: 50 }, () => a() === b()).filter(Boolean).length;
    ok(same < 5, `слишком много совпадений между сидами: ${same}`);
  });
});

describe("makeNoise", () => {
  it("детерминизм по сиду и отличие между сидами", () => {
    const n1 = makeNoise(777);
    const n2 = makeNoise(777);
    const n3 = makeNoise(778);
    let differs = 0;
    for (const [x, y] of grid(0.37, -20, 20)) {
      expect(n1(x, y)).toBe(n2(x, y));
      if (n1(x, y) !== n3(x, y)) differs++;
    }
    ok(differs > 100, `сиды 777 и 778 почти не отличаются: ${differs}`);
  });

  it("значения в [0, 1] и не вырождены в константу", () => {
    const n = makeNoise(5);
    let min = 1;
    let max = 0;
    for (const [x, y] of grid(0.23, -30, 30)) {
      const v = n(x, y);
      ok(v >= 0 && v <= 1, `выход за [0,1]: ${v} в (${x},${y})`);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    ok(max - min > 0.5, `размах шума слишком мал: ${min}..${max}`);
  });

  it("гладкий: сдвиг на сотую меняет значение не больше чем на 0.05", () => {
    const n = makeNoise(99);
    for (const [x, y] of grid(0.41, -15, 15)) {
      near(n(x + 0.01, y), n(x, y), 0.05, `скачок по x в (${x},${y})`);
      near(n(x, y + 0.01), n(x, y), 0.05, `скачок по y в (${x},${y})`);
    }
  });
});

describe("fbm", () => {
  it("в [0, 1], детерминирован, одна октава = сам шум", () => {
    const n = makeNoise(31);
    for (const [x, y] of grid(0.53, -10, 10)) {
      const v = fbm(n, x, y);
      ok(v >= 0 && v <= 1, `fbm вне [0,1]: ${v}`);
      expect(v).toBe(fbm(n, x, y));
      expect(fbm(n, x, y, 1)).toBe(n(x, y));
    }
  });
});

describe("warpedFbm", () => {
  it("warp = 0 — ровно fbm, без единого лишнего знака", () => {
    const n = makeNoise(13);
    for (const [x, y] of grid(0.47, -12, 12)) {
      expect(warpedFbm(n, x, y, 0)).toBe(fbm(n, x, y));
      expect(warpedFbm(n, x, y, 0, 4)).toBe(fbm(n, x, y, 4));
      // Мусор из рецепта админа тоже считаем «без варпа».
      expect(warpedFbm(n, x, y, Number.NaN)).toBe(fbm(n, x, y));
    }
  });

  it("варп двигает кромку, но не выводит значения из [0, 1]", () => {
    const n = makeNoise(21);
    let moved = 0;
    for (const [x, y] of grid(0.47, -12, 12)) {
      const v = warpedFbm(n, x, y, 0.5);
      ok(v >= 0 && v <= 1, `варп вывел за [0,1]: ${v}`);
      expect(v).toBe(warpedFbm(n, x, y, 0.5));
      if (v !== fbm(n, x, y)) moved++;
    }
    ok(moved > 500, `варп почти ничего не сдвинул: ${moved}`);
  });
});

describe("hexToXY", () => {
  it("соседи по всем шести направлениям на расстоянии 1", () => {
    const o = hexToXY(0, 0);
    expect(o).toEqual({ x: 0, y: 0 });
    const dirs: Array<[number, number]> = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, -1],
      [-1, 1],
    ];
    for (const [q, r] of dirs) {
      const p = hexToXY(q, r);
      near(Math.hypot(p.x, p.y), 1, 1e-9, `сосед (${q},${r})`);
    }
  });
});
