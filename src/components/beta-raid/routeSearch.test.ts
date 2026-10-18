// Маршрут и двери: сквозь дверь ведём ТОЛЬКО когда обхода нет и цены известны.
import { describe, expect, it } from "vitest";
import { routeTo, routeToAny, type RouteSearchOpts } from "./routeSearch";
import type { CellInfo, TerrainInfo } from "./hexStepCost";

const terrains: Record<string, TerrainInfo> = {
  land: { id: "land", name: "Трава", imageUrl: null, cost: 1 },
};

/** Коридор: герой (0,0) → дверь (1,0) → цель (2,0). Иных клеток нет. */
const corridor = (): Record<string, CellInfo> => ({
  "0,0": { terrainId: "land" },
  "1,0": { terrainId: "land" },
  "2,0": { terrainId: "land" },
});

/** Тот же коридор плюс обход снизу: (0,1) → (1,1) → (2,0). */
const withBypass = (): Record<string, CellInfo> => ({
  ...corridor(),
  "0,1": { terrainId: "land" },
  "1,1": { terrainId: "land" },
});

const keys = (path: Array<{ q: number; r: number }> | null) =>
  path?.map((s) => `${s.q},${s.r}`) ?? null;

const opts = (
  cells: Record<string, CellInfo>,
  extra: Partial<RouteSearchOpts>,
): RouteSearchOpts => ({
  playerPos: { q: 0, r: 0 },
  cells,
  terrains,
  doors: new Set(["1,0"]),
  ...extra,
});

describe("routeTo и двери", () => {
  it("цены не приехали (hardDoors undefined): дверь — стена, пути нет, как раньше", () => {
    expect(routeTo(opts(corridor(), {}), 2, 0)).toBeNull();
  });

  it("обхода нет, дверь открыта: маршрут идёт сквозь неё", () => {
    expect(keys(routeTo(opts(corridor(), { hardDoors: new Set() }), 2, 0))).toEqual(["1,0", "2,0"]);
  });

  it("дверь закрыта по уровню (в hardDoors): по-прежнему стена", () => {
    expect(routeTo(opts(corridor(), { hardDoors: new Set(["1,0"]) }), 2, 0)).toBeNull();
  });

  it("обход есть: маршрут обходит дверь, даже если она открыта и короче", () => {
    expect(keys(routeTo(opts(withBypass(), { hardDoors: new Set() }), 2, 0))).toEqual([
      "0,1",
      "1,1",
      "2,0",
    ]);
  });

  it("сама дверь — цель: путь В неё есть и без повтора", () => {
    expect(keys(routeTo(opts(corridor(), {}), 1, 0))).toEqual(["1,0"]);
  });
});

describe("routeToAny и двери", () => {
  it("к подходам цели за дверью — сквозь дверь, когда иначе не дойти", () => {
    expect(keys(routeToAny(opts(corridor(), { hardDoors: new Set() }), [{ q: 2, r: 0 }]))).toEqual([
      "1,0",
      "2,0",
    ]);
    expect(routeToAny(opts(corridor(), {}), [{ q: 2, r: 0 }])).toBeNull();
  });
});
