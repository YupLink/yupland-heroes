// Развилка поселений: organic — органический рост (placeTown через
// generate-town), ring/cross/grid/free — прежние трафареты planSettlements.
// Справочник, контекст карты и оба планировщика подменены: проверяем, КТО
// зовётся и с чем, а не как они расставляют.
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadBuildingOptions = vi.fn();
const loadRoadOptions = vi.fn();
const loadTownContext = vi.fn();
const planOrganicTowns = vi.fn();
const planSettlements = vi.fn();

vi.mock("./catalog-buildings", () => ({
  loadBuildingOptions: () => loadBuildingOptions(),
  loadRoadOptions: () => loadRoadOptions(),
}));
vi.mock("./town-context", () => ({
  loadTownContext: (...a: unknown[]) => loadTownContext(...a),
}));
vi.mock("./generate-town", () => ({
  planOrganicTowns: (...a: unknown[]) => planOrganicTowns(...a),
}));
vi.mock("@/lib/raid/zonegen/settlement", () => ({
  planSettlements: (...a: unknown[]) => planSettlements(...a),
}));

import { defaultRecipe, type ZonePatch } from "@/lib/raid/zonegen/recipe";
import { defaultSettlement, type SettlementRecipe } from "@/lib/raid/zonegen/settlement-types";
import { assertKnownBuildings, hasComposition, planZoneSettlements } from "./generate-settlement";

const CATALOG = [{ id: "b_shop", name: "Лавка", effect: null, tiers: 0, needsConfig: false }];
const ROADS = [{ id: "r_stone", name: "Брусчатка" }];
const EMPTY = { structures: [], report: { places: 0 } };

const patches: ZonePatch[] = [{ q: 0, r: 0, terrainId: "t_grass", decorationId: null }];

function call(settlement: Partial<SettlementRecipe>) {
  const recipe = {
    ...defaultRecipe("t_grass", 77),
    settlement: { ...defaultSettlement(), enabled: true, ...settlement },
  };
  return planZoneSettlements({
    recipe,
    patches,
    occupied: new Set(),
    roads: new Set(["0,1"]),
    terrainNames: { t_grass: "Луг" },
    mapId: "rmap_live",
    cells: [{ q: 0, r: 0 }],
  });
}

beforeEach(() => {
  for (const f of [loadBuildingOptions, loadRoadOptions, loadTownContext, planOrganicTowns]) {
    f.mockReset();
  }
  planSettlements.mockReset();
  loadBuildingOptions.mockResolvedValue(CATALOG);
  loadRoadOptions.mockResolvedValue(ROADS);
  loadTownContext.mockResolvedValue({ mapRoads: new Set(["-6,0"]), water: new Set() });
  planOrganicTowns.mockReturnValue(EMPTY);
  planSettlements.mockReturnValue(EMPTY);
});

describe("planZoneSettlements — развилка планировок", () => {
  it("organic + автоподбор: растёт без состава, трафарет не зовётся", async () => {
    const out = await call({ layout: "organic", auto: true, slots: [] });
    expect(out).toBe(EMPTY);
    expect(planSettlements).not.toHaveBeenCalled();
    expect(loadTownContext).toHaveBeenCalledWith("rmap_live", [{ q: 0, r: 0 }], { t_grass: "Луг" });
    const args = planOrganicTowns.mock.calls[0][0];
    expect(args.seed).toBe(77);
    // Дороги зоны и дороги за краем — один набор въездов.
    expect([...args.context.mapRoads].sort()).toEqual(["-6,0", "0,1"]);
  });

  it("ring/cross/grid/free — прежний планировщик, без запроса контекста", async () => {
    for (const layout of ["ring", "cross", "grid", "free"] as const) {
      planSettlements.mockClear();
      await call({ layout, slots: [{ buildingId: "b_shop", count: 1 }] });
      expect(planSettlements).toHaveBeenCalledTimes(1);
    }
    expect(planOrganicTowns).not.toHaveBeenCalled();
    expect(loadTownContext).not.toHaveBeenCalled();
  });

  it("трафарет без состава — поселений нет, справочник не читается", async () => {
    expect(await call({ layout: "ring", slots: [] })).toBeNull();
    expect(loadBuildingOptions).not.toHaveBeenCalled();
  });

  it("organic вручную без состава — тоже ничего: ставить нечего", async () => {
    expect(await call({ layout: "organic", auto: false, slots: [] })).toBeNull();
  });

  it("выключено — null, даже с автоподбором", async () => {
    const recipe = { ...defaultRecipe("t_grass", 1), settlement: defaultSettlement() };
    const out = await planZoneSettlements({
      recipe,
      patches,
      occupied: new Set(),
      roads: new Set(),
      terrainNames: {},
      mapId: "m",
      cells: [],
    });
    expect(out).toBeNull();
  });
});

describe("assertKnownBuildings", () => {
  const recipe = (over: Partial<SettlementRecipe>): SettlementRecipe => ({
    ...defaultSettlement(),
    enabled: true,
    ...over,
  });
  const ghost = [{ buildingId: "b_ghost", count: 1 }];

  it("автоподбор: слоты — лишь запасной состав панели, их не сверяем", () => {
    expect(() => assertKnownBuildings(recipe({ slots: ghost }), CATALOG, ROADS)).not.toThrow();
  });

  it("ручной состав: исчезнувший шаблон — отказ с его id", () => {
    expect(() =>
      assertKnownBuildings(recipe({ auto: false, slots: ghost }), CATALOG, ROADS),
    ).toThrow(/b_ghost/);
    expect(() =>
      assertKnownBuildings(recipe({ layout: "grid", slots: ghost }), CATALOG, ROADS),
    ).toThrow(/b_ghost/);
  });

  it("дорога — только из справочника", () => {
    expect(() => assertKnownBuildings(recipe({ roadId: "r_gone" }), CATALOG, ROADS)).toThrow(
      /r_gone/,
    );
  });

  it("hasComposition: автоподбор органики — всегда есть что ставить", () => {
    expect(hasComposition(recipe({ slots: [] }))).toBe(true);
    expect(hasComposition(recipe({ layout: "ring", slots: [] }))).toBe(false);
  });
});
