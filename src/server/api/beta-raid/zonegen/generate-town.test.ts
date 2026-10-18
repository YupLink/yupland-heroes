// Органический рост на сервере: что уходит в placeTown и что проверяется на
// выходе. Сам рост — забота lib/raid/zonegen/town; здесь он подменён, чтобы
// проверять ровно серверные правила: вода, дороги за краем, облик своего
// шаблона, «ставим только то, что есть», декор у улиц, потолок клеток.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TownInput, TownResult } from "@/lib/raid/zonegen/town/types";

const placeTown = vi.fn<(input: TownInput) => TownResult>();
vi.mock("@/lib/raid/zonegen/town/place", () => ({
  placeTown: (input: TownInput) => placeTown(input),
}));

import { ZONE_MAX_CELLS, type ZonePatch } from "@/lib/raid/zonegen/recipe";
import {
  defaultSettlement,
  type BuildingOption,
  type SettlementReport,
  type ZoneStructure,
} from "@/lib/raid/zonegen/settlement-types";
import {
  clearDecorAlongRoads,
  mergeReports,
  planOrganicTowns,
  townOptions,
  verifyTownStructures,
} from "./generate-town";

const opt = (
  id: string,
  name: string,
  effect: string | null,
  extra: Partial<BuildingOption> = {},
) => ({ id, name, effect, tiers: 0, needsConfig: false, skins: [], ...extra }) as BuildingOption;

const CATALOG: BuildingOption[] = [
  opt("b_hall", "Ратуша", "town_hall", { skins: [{ id: "sk_hall_boar", name: "Ратуша Кабан" }] }),
  opt("b_shop", "Лавка", null, { skins: [{ id: "sk_shop_boar", name: "Кабан" }] }),
  opt("b_gate", "Ворота", "portal", { needsConfig: true }),
];

const report = (over: Partial<SettlementReport> = {}): SettlementReport => ({
  places: 1,
  buildings: 0,
  roadCells: 0,
  byBuilding: {},
  shortfall: 0,
  ...over,
});

describe("verifyTownStructures", () => {
  it("облик своего шаблона остаётся, чужой снимается, декор под домом гаснет", () => {
    const { structures, strippedSkins } = verifyTownStructures(
      [
        { q: 0, r: 0, buildingId: "b_hall", buildingSkinId: "sk_hall_boar", decorationId: "tree" },
        { q: 1, r: 0, buildingId: "b_shop", buildingSkinId: "sk_hall_boar" },
        { q: 2, r: 0, roadId: "r1" },
        { q: 3, r: 0, buildingSkinId: "sk_shop_boar" },
      ],
      CATALOG,
    );
    expect(structures[0].buildingSkinId).toBe("sk_hall_boar");
    expect(structures[0].decorationId).toBeNull();
    expect(structures[1].buildingSkinId).toBeUndefined();
    expect(structures[2].decorationId).toBeNull();
    // Облик без постройки на клетке — не к чему его крепить.
    expect(structures[3].buildingSkinId).toBeUndefined();
    expect(strippedSkins).toBe(2);
  });

  it("шаблона нет в справочнике — отказ с его id, а не чёрная точка на карте", () => {
    expect(() => verifyTownStructures([{ q: 0, r: 0, buildingId: "b_gone" }], CATALOG)).toThrow(
      /b_gone/,
    );
  });
});

describe("townOptions", () => {
  it("автоподбор: ненастроенные (ворота-портал) в город не идут", () => {
    expect(townOptions(CATALOG, null).map((o) => o.id)).not.toContain("b_gate");
  });

  it("ручной состав: явно вписанные ворота ставятся фоном", () => {
    const got = townOptions(CATALOG, [{ buildingId: "b_gate", count: 1 }]);
    expect(got.find((o) => o.id === "b_gate")?.role).toBe("house");
  });
});

describe("clearDecorAlongRoads", () => {
  it("снимает декор у новой улицы, но не трогает клетки города и дальние", () => {
    const patches: ZonePatch[] = [
      { q: 1, r: 0, terrainId: "g", decorationId: "tree" },
      { q: 0, r: 1, terrainId: "g", decorationId: null },
      { q: 5, r: 5, terrainId: "g", decorationId: "tree" },
      { q: -1, r: 0, terrainId: "g", decorationId: "tree" },
    ];
    const extra = clearDecorAlongRoads(patches, [
      { q: 0, r: 0, roadId: "r1" },
      { q: -1, r: 0, buildingId: "b_shop" },
    ]);
    expect(extra).toEqual([{ q: 1, r: 0, decorationId: null }]);
  });
});

describe("mergeReports", () => {
  it("суммы по городам, форма и тема — первого", () => {
    const got = mergeReports([
      report({ buildings: 3, byBuilding: { Лавка: 2 }, form: "town", theme: "Кабан", gates: 2 }),
      report({ buildings: 2, byBuilding: { Лавка: 1 }, form: "hamlet", theme: null, gates: 1 }),
    ]);
    expect(got.places).toBe(2);
    expect(got.buildings).toBe(5);
    expect(got.byBuilding).toEqual({ Лавка: 3 });
    expect(got.form).toBe("town");
    expect(got.theme).toBe("Кабан");
    expect(got.gates).toBe(3);
  });
});

describe("planOrganicTowns", () => {
  const patches: ZonePatch[] = [
    { q: 0, r: 0, terrainId: "t_grass", decorationId: null },
    { q: 1, r: 0, terrainId: "t_water", decorationId: null },
    { q: 0, r: 1, terrainId: "t_grass", decorationId: "tree" },
  ];
  const args = (over: Partial<ReturnType<typeof defaultSettlement>> = {}) => ({
    settlement: {
      ...defaultSettlement(),
      enabled: true,
      buildings: 24,
      theme: "Кабан",
      kind: "port" as const,
      ...over,
    },
    seed: 42,
    patches,
    occupied: new Set(["9,9"]),
    context: { mapRoads: new Set(["-6,0"]), water: new Set(["7,7"]) },
    terrainNames: { t_grass: "Луг", t_water: "Вода" },
    buildings: CATALOG,
  });

  beforeEach(() => {
    placeTown.mockReset();
    placeTown.mockReturnValue({
      structures: [{ q: 0, r: 0, buildingId: "b_hall", buildingSkinId: "sk_hall_boar" }],
      report: report({ buildings: 1 }),
      skeleton: null,
      placed: [],
    });
  });

  it("вход роста: вода патчей и вокруг, дороги за краем, декор не помеха", () => {
    planOrganicTowns(args());
    const input = placeTown.mock.calls[0][0];
    expect([...input.water].sort()).toEqual(["1,0", "7,7"]);
    expect([...input.mapRoads]).toEqual(["-6,0"]);
    expect(input.occupied.has("9,9")).toBe(true);
    expect(input.decorBlocked.size).toBe(0);
    expect(input.buildings).toBe(24);
    expect(input.theme).toBe("Кабан");
    expect(input.kind).toBe("port");
    expect(input.manual).toBeNull();
    expect(input.cells).toHaveLength(3);
    expect(input.options.map((o) => o.id)).not.toContain("b_gate");
  });

  it("вода из базы под свежей травой — суша: остров из океана застраивается", () => {
    // Прод, 25.09: зона над океаном залита травой, а город не встал ни одним
    // домом — вода из базы перекрывала новую местность.
    planOrganicTowns({
      ...args(),
      context: { mapRoads: new Set(), water: new Set(["0,0", "0,1", "1,0", "7,7"]) },
    });
    const input = placeTown.mock.calls[0][0];
    expect(input.water.has("0,0")).toBe(false);
    expect(input.water.has("0,1")).toBe(false);
    expect(input.water.has("1,0")).toBe(true);
    expect(input.water.has("7,7")).toBe(true);
  });

  it("автоподбор выкл. — ручной состав уходит в рост как есть", () => {
    const slots = [{ buildingId: "b_shop", count: 2 }];
    planOrganicTowns(args({ auto: false, slots }));
    expect(placeTown.mock.calls[0][0].manual).toEqual(slots);
  });

  it("тот же сид — тот же подсид роста; другой сид — другой", () => {
    planOrganicTowns(args());
    planOrganicTowns(args());
    planOrganicTowns({ ...args(), seed: 43 });
    const seeds = placeTown.mock.calls.map((c) => c[0].seed);
    expect(seeds[0]).toBe(seeds[1]);
    expect(seeds[2]).not.toBe(seeds[0]);
  });

  it("облик сверен с шаблоном, чужой шаблон — отказ", () => {
    const ok = planOrganicTowns(args());
    expect(ok.structures[0].buildingSkinId).toBe("sk_hall_boar");
    placeTown.mockReturnValue({
      structures: [{ q: 0, r: 0, buildingId: "b_alien" }],
      report: report(),
      skeleton: null,
      placed: [],
    });
    expect(() => planOrganicTowns(args())).toThrow(/b_alien/);
  });

  it("потолок: не больше ZONE_MAX_CELLS правок за вызов", () => {
    const many: ZoneStructure[] = Array.from({ length: ZONE_MAX_CELLS + 50 }, (_, i) => ({
      q: i,
      r: 0,
      decorationId: null,
    }));
    placeTown.mockReturnValue({ structures: many, report: report(), skeleton: null, placed: [] });
    expect(planOrganicTowns(args()).structures).toHaveLength(ZONE_MAX_CELLS);
  });
});
