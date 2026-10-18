// Раздел зоны на поселения: радиус по таблице спецификации, центры дальней
// точкой с минимальным шагом, клетки — к ближайшему центру.
import { describe, expect, it } from "vitest";
import { hexDistance } from "@/lib/raid/hex";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { splitZone, townRadius } from "./town-split";

/** Гекс радиуса R вокруг (0,0): A(R) = 3R²+3R+1 клеток. */
function hexArea(radius: number): ZoneCell[] {
  const out: ZoneCell[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      out.push({ q, r });
    }
  }
  return out;
}

describe("townRadius", () => {
  it("ступени шага 2: 3–4 → 2, 5–11 → 3, 12–21 → 4, 22–32 → 5, 33–40 → 6", () => {
    expect([3, 4, 5, 11, 12, 21, 22, 32, 33, 40].map(townRadius)).toEqual([
      2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ]);
  });
});

describe("splitZone", () => {
  const land = () => true;

  it("одно поселение — вся зона одним участком", () => {
    const cells = hexArea(5);
    expect(splitZone({ cells, isLand: land, count: 1, buildings: 12, seed: 1 })).toEqual([cells]);
  });

  it("три поселения на просторной зоне: участки не пересекаются и покрывают всё", () => {
    const cells = hexArea(20);
    const parts = splitZone({ cells, isLand: land, count: 3, buildings: 12, seed: 7 });
    expect(parts).toHaveLength(3);
    const keys = parts.flat().map((c) => `${c.q},${c.r}`);
    expect(new Set(keys).size).toBe(cells.length);
    expect(keys).toHaveLength(cells.length);
  });

  it("тесно — центров меньше, чем просили: города не срастаются окраинами", () => {
    // Rb(24) = 5, шаг ≥ 2·5+3 = 13, а в гексе радиуса 6 дальше 12 не уйти.
    const parts = splitZone({ cells: hexArea(6), isLand: land, count: 4, buildings: 24, seed: 3 });
    expect(parts).toHaveLength(1);
  });

  it("центры разнесены: пять участков не слипаются в один", () => {
    const cells = hexArea(24);
    const parts = splitZone({ cells, isLand: land, count: 5, buildings: 7, seed: 11 });
    expect(parts.length).toBeGreaterThanOrEqual(3);
    // Центр участка ≈ его медиана; проверяем через попарный разнос «центров масс».
    const mid = parts.map((p) => {
      const q = Math.round(p.reduce((s, c) => s + c.q, 0) / p.length);
      const r = Math.round(p.reduce((s, c) => s + c.r, 0) / p.length);
      return { q, r };
    });
    for (let i = 0; i < mid.length; i++) {
      for (let j = i + 1; j < mid.length; j++) {
        expect(hexDistance(mid[i].q, mid[i].r, mid[j].q, mid[j].r)).toBeGreaterThan(5);
      }
    }
  });

  it("вода в участки едет, но центром не бывает", () => {
    const cells = hexArea(20);
    const isLand = (k: string) => Number(k.split(",")[0]) < 0;
    const parts = splitZone({ cells, isLand, count: 2, buildings: 5, seed: 2 });
    expect(parts.flat()).toHaveLength(cells.length);
    expect(parts).toHaveLength(2);
  });

  it("тот же сид — тот же раздел, ничья решается хешем клетки", () => {
    const cells = hexArea(18);
    const a = splitZone({ cells, isLand: land, count: 4, buildings: 12, seed: 99 });
    const b = splitZone({ cells, isLand: land, count: 4, buildings: 12, seed: 99 });
    expect(a).toEqual(b);
  });

  it("нет суши — делить нечего, зона одним участком", () => {
    const cells = hexArea(8);
    const parts = splitZone({ cells, isLand: () => false, count: 3, buildings: 12, seed: 1 });
    expect(parts).toEqual([cells]);
  });
});
