// Мир строителей (lib/landPlace): стопка land:<местность>, радиус 3, пустота и
// перестройка за энергию, предел координат мира.
import { describe, expect, it } from "vitest";
import {
  LAND_COORD_LIMIT,
  LAND_RADIUS,
  LAND_REBUILD_ENERGY,
  landCellCost,
  type LandSpot,
  inLandLimit,
  isLandStackKey,
  landCellReason,
  landDist,
  landOfStack,
  landStackKey,
} from "./landPlace";
import { normalizeGiveAmount } from "./marketItem";

describe("стопка земли", () => {
  it("land:<местность> туда и обратно; прочее — не земля", () => {
    expect(landStackKey("terrain_QArF-OKH-s")).toBe("land:terrain_QArF-OKH-s");
    expect(landOfStack("land:terrain_QArF-OKH-s")).toBe("terrain_QArF-OKH-s");
    expect(isLandStackKey("land:terrain_x")).toBe(true);
    for (const k of [
      "tree:decoration_x",
      "land:",
      "land:decoration_x",
      "custom:cst_1",
      null,
      undefined,
    ]) {
      expect(isLandStackKey(k)).toBe(false);
    }
  });
});

describe("куда можно положить", () => {
  it("радиус 4: своя клетка и четыре круга (61 клетка)", () => {
    expect(LAND_RADIUS).toBe(4);
    expect(landDist({ q: 0, r: 0 }, { q: 3, r: -3 })).toBe(3);
    expect(landDist({ q: 0, r: 0 }, { q: 2, r: 2 })).toBe(4);
  });

  it("пустота — можно даром; другая местность — перестройка за 5 ⚡; прочее — почему нельзя", () => {
    const T = "terrain_grass";
    const at = (dq: number, dr: number, spot: LandSpot = null, hero = false) =>
      landCellReason({ dq, dr, q: dq, r: dr, spot, hero, terrainId: T });
    expect(at(1, 0)).toBeNull();
    expect(at(-3, 3)).toBeNull();
    expect(at(1, 0, { terrainId: "terrain_water", built: false })).toBeNull();
    expect(at(1, 0, { terrainId: T, built: false })).toBe("land.same");
    expect(at(1, 0, { terrainId: "terrain_water", built: true })).toBe("land.built");
    // Своя постройка не мешает (владелец 05.11), чужая — мешает, вода под свою — нет.
    expect(
      at(1, 0, { terrainId: "terrain_sand", built: false, building: true, ownBuilding: true }),
    ).toBeNull();
    expect(at(1, 0, { terrainId: "terrain_sand", built: false, building: true })).toBe(
      "land.building_other",
    );
    expect(
      landCellReason({
        dq: 1,
        dr: 0,
        q: 1,
        r: 0,
        spot: { terrainId: "terrain_sand", built: false, building: true, ownBuilding: true },
        hero: false,
        terrainId: "terrain_water",
        water: true,
      }),
    ).toBe("land.water_building");
    expect(at(1, 0, { terrainId: "terrain_water", built: false }, true)).toBe("land.hero");
    expect(at(2, 2)).toBeNull();
    expect(at(3, 2)).toBe("land.far");
    expect(
      landCellReason({
        dq: 1,
        dr: 0,
        q: LAND_COORD_LIMIT + 1,
        r: 0,
        spot: null,
        hero: false,
        terrainId: T,
      }),
    ).toBe("land.edge");
    expect(LAND_REBUILD_ENERGY).toBe(5);
    expect(landCellCost(null)).toBe(0);
    expect(landCellCost({ terrainId: "terrain_water", built: false })).toBe(5);
  });

  it("мир — до ±32000 по q и r (формат карты — 16 бит)", () => {
    expect(LAND_COORD_LIMIT).toBeLessThanOrEqual(32767);
    expect(inLandLimit(32000, -32000)).toBe(true);
    expect(inLandLimit(32001, 0)).toBe(false);
  });
});

describe("пачка в лавке", () => {
  it("«Сколько» у земли — целое от 1, у прочих шаблонных — 1", () => {
    expect(normalizeGiveAmount("land", 5)).toBe(5);
    expect(normalizeGiveAmount("land", 0)).toBe(1);
    expect(normalizeGiveAmount("land", 2.7)).toBe(2);
    expect(normalizeGiveAmount("tree", 5)).toBe(1);
  });
});
