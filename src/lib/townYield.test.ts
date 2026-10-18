// Добыча ратуши с окрестности (владелец, 08.10.2026): радиус 10, клетка —
// ближайшей ратуше, по таблице «Связки товар — местность».
import { describe, expect, it } from "vitest";
import { YIELD_TABLE } from "./townYieldTable";
import { PLAIN_FISH, areaOf, areaYield, cellShare, chanceOn, type AreaCell } from "./townYield";

const SNOW = "terrain_n6vNTT3B9G";
const GRASS = "terrain_A5WcpQq_bW";
const UNICORNS = "terrain_8I8soK3-Xb";
const WATER = "terrain_HkP00zwDo-";
const CUCUMBER = "cst_1i90lt8xpvv8";
const WINTER_CONE = "cst_dhwbu2xna349";
const APPLE = "cst_npbej44tjvtc";
const SNOW_FIR = "decoration_DmliXWfza-";

const rowOf = (item: string) => YIELD_TABLE.find((r) => r.item === item)!;
const cell = (
  q: number,
  r: number,
  terrainId: string,
  decorId: string | null = null,
): AreaCell => ({
  q,
  r,
  terrainId,
  decorId,
});

describe("шанс по местности", () => {
  it("своя местность в строке главнее группы", () => {
    expect(chanceOn(rowOf(APPLE), UNICORNS)).toBe(0.2);
    expect(chanceOn(rowOf(APPLE), GRASS)).toBe(0.1);
    expect(chanceOn(rowOf(CUCUMBER), GRASS)).toBe(0);
  });
});

describe("чья клетка", () => {
  const a = { q: 0, r: 0 };
  const b = { q: 6, r: 0 };
  it("ближайшей ратуше — вся, ничья — поровну, дальней — ничего", () => {
    expect(cellShare({ q: 1, r: 0 }, a, [a, b])).toBe(1);
    expect(cellShare({ q: 3, r: 0 }, a, [a, b])).toBe(0.5);
    expect(cellShare({ q: 5, r: 0 }, a, [a, b])).toBe(0);
  });
});

describe("добыча с окрестности", () => {
  const hall = { q: 0, r: 0 };
  it("снег даёт огурцы и шишку, ель — шишку; дальше радиуса не считается", () => {
    const cells = [
      ...Array.from({ length: 10 }, (_, i) => cell(i - 5, 1, SNOW)),
      cell(0, 2, SNOW, SNOW_FIR),
      cell(0, 30, SNOW, SNOW_FIR), // за радиусом
    ];
    const y = areaYield({ hall, halls: [hall], cells, fish: [] });
    // 11 клеток снега × 0,4 × 0,75 и × 0,2 × 0,75; ель — 1,5 в сутки.
    expect(y[CUCUMBER]).toBeCloseTo(3.3, 6);
    expect(y[WINTER_CONE]).toBeCloseTo(3.15, 6);
  });

  it("рыба из воды делится на виды по долям рыбалки; без долей — вся обычная", () => {
    const cells = Array.from({ length: 10 }, (_, i) => cell(i, -1, WATER));
    const split = areaYield({
      hall,
      halls: [hall],
      cells,
      fish: [
        { id: PLAIN_FISH, pct: 75 },
        { id: "cst_rare", pct: 25 },
      ],
    });
    expect(split[PLAIN_FISH]).toBe(2.25);
    expect(split.cst_rare).toBe(0.75);
    expect(split.fish).toBeUndefined();
    expect(areaYield({ hall, halls: [hall], cells, fish: [] })[PLAIN_FISH]).toBe(3);
  });

  it("клетка ближе к соседней ратуше работает на неё", () => {
    const other = { q: 4, r: 0 };
    const y = areaYield({ hall, halls: [hall, other], cells: [cell(3, 0, SNOW)], fish: [] });
    expect(y[CUCUMBER]).toBeUndefined();
  });

  it("в ратушу идёт только свой товар", () => {
    expect(areaOf({ kind: "custom", refId: CUCUMBER }, { [CUCUMBER]: 4 })).toBe(4);
    expect(areaOf({ kind: "resource", refId: "wood" }, { wood: 4 })).toBe(0);
  });
});
