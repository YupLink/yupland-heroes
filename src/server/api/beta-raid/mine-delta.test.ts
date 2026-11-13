// Шахта в дельте карты (§8.59 п. 9): эффект «шахта», назначенный клетке в
// режиме бога, и снятый с неё купол доходят до игроков без перезахода; правка
// блока-шахты — полным снимком; беглец не возвращается домой на шахту.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  block: [] as Row[][],
  lifted: [] as Row[],
  runner: [] as Row[],
  journal: [] as Array<{ kind: string; patches?: unknown[] }>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: ((d: unknown) => unknown) | null = null;
    const b = {
      inputValidator: (v: (d: unknown) => unknown) => ((validate = v), b),
      handler: (h: (ctx: { data: unknown }) => unknown) => async (args: { data?: unknown }) =>
        h({ data: validate ? validate(args?.data) : args?.data }),
    };
    return b;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("AS by_block")) return s.block.shift() ?? [];
    if (sql.includes("c.building_config, c.group_id")) return s.lifted;
    if (sql.includes("FROM yuplink.beta_raid_runner rn")) return s.runner;
    // Земля под клетками кисти есть у всех спрошенных.
    if (sql.includes("AND terrain_id IS NOT NULL"))
      return [...sql.matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => ({ q: +m[1], r: +m[2] }));
    return [];
  },
}));
vi.mock("../../auth", () => ({ requireAdmin: () => "admin.near" }));
vi.mock("./god-map", () => ({ godMapId: async () => "m1" }));
vi.mock("./island/island-editor-auth", () => ({
  requireGodMap: async () => ({ mapId: "m1", admin: true }),
  designerPatch: (c: unknown) => c,
  designerBuildings: async () => new Set(),
}));
vi.mock("../usdt-cells", () => ({ assertUsdtPatches: async () => undefined }));
vi.mock("../../raidLive", () => ({ publishRaid: () => undefined }));
vi.mock("./map-base", () => ({ purgeMapBase: () => undefined }));
vi.mock("./voidCells", () => ({
  dropVoidCache: () => undefined,
  withoutVoid: async (_m: string, c: string[]) => c,
}));
vi.mock("./flee-cells", () => ({ dropFleeCache: () => undefined }));
vi.mock("./map-darai-hold", () => ({
  readDaraiHold: async () => null,
  settleDaraiHold: async () => undefined,
}));
vi.mock("./town-resolve", () => ({
  ensureTownSchema: async () => undefined,
  readOldBuildings: async () => new Map(),
  readCellBuildingId: async () => null,
  handleBuildingChange: async () => undefined,
}));
vi.mock("./ship-rescue", () => ({ rescueStuckShips: async () => ({ moved: 0, stuck: 0 }) }));
vi.mock("./map-change-hooks", () => ({
  noteMapRebuilt: async () => void s.journal.push({ kind: "full" }),
  noteAdminPatches: async (_m: string, patches: unknown[]) =>
    void s.journal.push({ kind: "delta", patches }),
  noteCellsChanged: async () => void s.journal.push({ kind: "cells" }),
  cellTruthPatches: async () => [],
}));

import { deltaBuildingConfig } from "./delta-building-config";
import { batchDeltaPatches } from "./admin-batch-journal";
import { adminPatchCells } from "./admin-live-batch";
import { adminPatchCell } from "./admin-live-edit";
import { fillLifted } from "./map-lifted";
import { returnRunnersHome } from "./runner-home";
import { mineCellSql } from "./mine-cell-sql";

type Fn = (args: { data?: unknown }) => Promise<unknown>;
const call = (f: unknown, data: unknown) => (f as Fn)({ data });
const flat = (x: string) => x.replace(/\s+/g, " ");

beforeEach(() => {
  s.sql = [];
  s.block = [];
  s.lifted = [];
  s.runner = [];
  s.journal = [];
});

describe("настройки постройки в дельте — только эффект", () => {
  it("эффект клетки; без эффекта — {}; нет настроек или мусор — null", () => {
    expect(deltaBuildingConfig({ effect: "mine", token: "Darai", yield: 100000 })).toEqual({
      effect: "mine",
    });
    expect(deltaBuildingConfig('{"effect":"market","text":"x"}')).toEqual({ effect: "market" });
    expect(deltaBuildingConfig({ text: "Табличка" })).toEqual({});
    expect(deltaBuildingConfig({ effect: "" })).toEqual({});
    expect(deltaBuildingConfig(null)).toBeNull();
    expect(deltaBuildingConfig("{oops")).toBeNull();
    expect(deltaBuildingConfig([1])).toBeNull();
  });

  it("кисть: правка одних настроек — тоже патч дельты", () => {
    expect(
      batchDeltaPatches([
        { q: 75, r: 89, buildingConfig: { effect: "mine", yield: 5 } },
        { q: 1, r: 1, buildingConfig: null },
        { q: 2, r: 2, alive: false },
      ]),
    ).toEqual([
      { q: 75, r: 89, buildingConfig: { effect: "mine" } },
      { q: 1, r: 1, buildingConfig: null },
    ]);
  });
});

describe("выгрузка кисти (adminPatchCells)", () => {
  it("эффект «шахта» клетке — дельтой с эффектом, а не молчком", async () => {
    await call(adminPatchCells, {
      cells: [{ q: 95, r: -134, buildingConfig: { effect: "mine" } }],
    });
    expect(s.journal).toEqual([
      { kind: "delta", patches: [{ q: 95, r: -134, buildingConfig: { effect: "mine" } }] },
    ]);
  });

  it("сменились члены блока-шахты — «карта перестроена»", async () => {
    s.block = [[], [{ q: 58, r: 73, group_id: "g1", by_block: true }]];
    await call(adminPatchCells, { cells: [{ q: 58, r: 73, groupId: "g1" }] });
    expect(s.journal).toEqual([{ kind: "full" }]);
    // До правки и после — оба раза спросили и названный блок.
    const probes = s.sql.filter((x) => x.includes("AS by_block"));
    expect(probes).toHaveLength(2);
    for (const p of probes) expect(p).toContain("ARRAY['g1']");
  });

  it("блок без шахты — по-прежнему дельтой", async () => {
    s.block = [[], []];
    await call(adminPatchCells, { cells: [{ q: 1, r: 1, groupId: "g2", iconScale: 1.5 }] });
    expect(s.journal).toEqual([
      { kind: "delta", patches: [{ q: 1, r: 1, groupId: "g2", iconScale: 1.5 }] },
    ]);
  });
});

describe("правка по клетке (adminPatchCell): купол", () => {
  it("с члена блока-шахты — полным снимком; с обычной клетки — дельтой", async () => {
    s.block = [[{ q: 76, r: 88, group_id: "g", by_block: true }]];
    await call(adminPatchCell, { q: 76, r: 88, voidFog: false });
    expect(s.journal).toEqual([{ kind: "full" }]);
    s.journal = [];
    s.block = [[]];
    await call(adminPatchCell, { q: 5, r: 5, voidFog: false });
    expect(s.journal[0]?.kind).toBe("delta");
  });
});

describe("снятый купол (fillLifted) несёт эффект клетки", () => {
  it("постройка с эффектом клетки — buildingConfig с эффектом; пустая — null", async () => {
    s.lifted = [
      {
        q: 75,
        r: 89,
        terrain_id: "t",
        road_id: null,
        decoration_id: null,
        building_id: "building_shop",
        building_skin_id: null,
        building_config: { effect: "mine", token: "Darai" },
        group_id: null,
        icon_scale: null,
      },
      { q: 1, r: 1, terrain_id: "t", building_id: null, building_config: { effect: "mine" } },
    ];
    const out = await fillLifted("m1", [
      { q: 75, r: 89, voidFog: false },
      { q: 1, r: 1, voidFog: false },
    ]);
    expect(out[0]).toMatchObject({
      buildingId: "building_shop",
      buildingConfig: { effect: "mine" },
    });
    expect(out[1]).toMatchObject({ buildingId: null, buildingConfig: null });
  });
});

describe("беглецы домой (returnRunnersHome): дом-шахта", () => {
  it("на шахту не возвращается и не паркуется — остаётся, где был", async () => {
    await returnRunnersHome({ mapId: "m1", kindFilter: "true", resourceOk: "true" });
    const sql = flat(s.sql[0]);
    expect(sql).toContain(
      flat(`COALESCE(hc.map_id IS NOT NULL AND ${mineCellSql("hc")}, false) AS home_mine`),
    );
    expect(sql).toContain("AND p.home_free AND NOT p.home_mine AND c.object_id IS NULL");
    expect(sql).toMatch(
      /NOT EXISTS \(SELECT 1 FROM back b WHERE b\.id = p\.id\) AND NOT p\.home_mine/,
    );
    // Дом не трогаем, боевое состояние на месте — стираем (поднят целым).
    expect(sql).toMatch(
      /h\.q = p\.home_q AND h\.r = p\.home_r AND h\.cycle_no = \d+ AND NOT p\.home_mine/,
    );
    expect(sql).toMatch(/\(h\.q = p\.q AND h\.r = p\.r AND h\.cycle_no = \d+\)/);
  });

  it("поднятый на месте считается в parked — иначе восстановление не пересоберёт карту", async () => {
    s.runner = [{ returned: 0, parked: 1 }];
    const out = await returnRunnersHome({ mapId: "m1", kindFilter: "true", resourceOk: "true" });
    expect(out).toEqual({ returned: 0, parked: 1 });
    const sql = flat(s.sql[0]);
    expect(sql).toContain("(h.map_id IS NOT NULL) AS hurt");
    // остался на месте (не вернулся, не переехал), но боевое состояние стёрто
    expect(sql).toContain(
      flat(`+ (SELECT count(*)::int FROM pick p
        WHERE p.hurt
          AND NOT EXISTS (SELECT 1 FROM back b WHERE b.id = p.id)
          AND NOT EXISTS (SELECT 1 FROM parked x WHERE x.id = p.id)) AS parked`),
    );
  });
});
