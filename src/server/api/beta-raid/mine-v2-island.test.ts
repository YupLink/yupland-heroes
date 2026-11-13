// Шахты острова новичка на v2 (ПРАВИЛА §8.59 п. 11): цена острова, режим всегда
// «База», одна починка на клетку (выработанную не чинят), смена режима закрыта;
// правила острова — только флаг клетки И карта острова. Плюс разбор клетки:
// островной вид окна и колонки island/spent.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  mapId: "isle_abc123",
  owner: null as string | null,
  broken: true,
  spent: false,
  resources: [
    { resource: "gold", amount: 50 },
    { resource: "wood", amount: 150 },
    { resource: "stone", amount: 150 },
  ] as Array<{ resource: string; amount: number }>,
  config: {
    effect: "mine",
    resource: "diamonds",
    island: true,
    yield: 1,
    captureCost: 0,
  } as Record<string, unknown>,
  dbError: null as string | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "me.near" }));
vi.mock("../../rateGate", () => ({ actionGate: async () => {} }));
vi.mock("../currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => s.mapId,
  playerCell: async () => ({ q: 0, r: 0 }),
  requireAdjacent: () => {},
}));
vi.mock("./voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("./building-action", () => ({
  loadCellBuilding: async () => ({ effect: "mine", tier: 0, tiers: [{}], config: s.config }),
}));
vi.mock("./mine-v2-read", async (orig) => ({
  ...(await orig<typeof import("./mine-v2-read")>()),
  loadMineCell: async () => ({
    owner: s.broken ? null : s.owner,
    claimedHours: 0,
    capturedAt: null,
    pending: 0,
    view: { broken: s.broken, spent: s.spent, island: true },
    live: null,
  }),
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("account_achievement")) return [];
    s.sql.push(sql);
    if (sql.includes("account_resources")) return s.resources;
    if (s.dbError) throw new Error(s.dbError);
    if (sql.includes("raid_mine_repair")) {
      return [{ captured: s.broken, applied: true, credited: 0, credited_to: null }];
    }
    if (sql.includes("raid_mine_set_mode")) return [{ changed: true, credited: 0 }];
    return [];
  },
}));
vi.mock("../../raidLive", () => ({ publishRaid: () => {} }));

const mod = await import("./mine-v2");
const { mineCellState, mineV2ErrorKey } = await import("./mine-v2-read");
const { cellStateSql } = await import("./mine-v2-sql");
type Repair = (a: {
  data: { q: number; r: number; mode: string; opId: string };
}) => Promise<{ ok: true; captured: boolean; applied: boolean }>;
const repair = mod.repairMine as unknown as Repair;
const setMode = mod.setMineMode as unknown as (a: {
  data: { q: number; r: number; mode: string };
}) => Promise<{ ok: true }>;
const data = { q: 4, r: -2, mode: "max", opId: "op_isle_0001" };
const repairCall = () => s.sql.find((x) => x.includes("raid_mine_repair")) ?? "";

beforeEach(() => {
  Object.assign(s, {
    sql: [],
    mapId: "isle_abc123",
    owner: null,
    broken: true,
    spent: false,
    config: { effect: "mine", resource: "diamonds", island: true, yield: 1, captureCost: 0 },
    dbError: null,
  });
});

describe("починка шахты острова", () => {
  it("алмазная — 100 дерева + 100 камня; режим всегда «База», что бы ни прислали", async () => {
    const res = await repair({ data });
    expect(res.captured).toBe(true);
    expect(repairCall()).toContain(`'{"wood":100,"stone":100}'::jsonb`);
    expect(repairCall()).toContain("'base'");
    expect(repairCall()).not.toContain("'max'");
  });

  it("дерево/камень — 20 золота, золото — 1 алмаз (как в мире)", async () => {
    s.config = { ...s.config, resource: "wood" };
    await repair({ data });
    expect(repairCall()).toContain(`'{"gold":20}'::jsonb`);
  });

  it("флаг на клетке мира — цена и режим мира (дешёвое в мир не уходит)", async () => {
    s.mapId = "maze";
    s.resources = [
      { resource: "wood", amount: 20_000 },
      { resource: "stone", amount: 2_000 },
    ];
    await repair({ data });
    expect(repairCall()).toContain(`'{"wood":10000,"stone":1000}'::jsonb`);
    expect(repairCall()).toContain("'max'");
  });

  it("выработанная (уже чинили, ничья) — отказ до денег и до базы", async () => {
    s.spent = true;
    await expect(repair({ data })).rejects.toThrow("braid.mine_spent");
    expect(s.sql).toEqual([]);
  });

  it("своя работающая после починки — только повтор: без проверки денег, решает база", async () => {
    s.broken = false;
    s.owner = "acc_me";
    s.spent = true;
    s.resources = [];
    const res = await repair({ data });
    expect(res.ok).toBe(true);
    expect(s.sql.some((x) => x.includes("account_resources"))).toBe(false);
    expect(repairCall()).toContain("'rep:acc_me:op_isle_0001'");
    // Новый нажим той же своей — база откажет «выработана».
    s.sql = [];
    s.dbError = "MCP error: mine_spent";
    await expect(repair({ data })).rejects.toThrow("braid.mine_spent");
  });

  it("отказы базы острова — ключами словаря", () => {
    expect(mineV2ErrorKey("MCP error: mine_spent")).toBe("braid.mine_spent");
    expect(mineV2ErrorKey("x mine_island_mode")).toBe("braid.mine_island_mode");
  });
});

describe("режим на острове", () => {
  it("смена режима закрыта — до базы", async () => {
    s.broken = false;
    s.owner = "acc_me";
    await expect(setMode({ data: { q: 4, r: -2, mode: "mid" } })).rejects.toThrow(
      "braid.mine_island_mode",
    );
    expect(s.sql.some((x) => x.includes("raid_mine_set_mode"))).toBe(false);
  });

  it("клетка мира с флагом — режим меняется как в мире (база сама решит)", async () => {
    s.mapId = "maze";
    await setMode({ data: { q: 4, r: -2, mode: "mid" } });
    expect(s.sql.some((x) => x.includes("raid_mine_set_mode"))).toBe(true);
  });
});

describe("клетка острова в окне", () => {
  const H = 3_600_000;
  const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);
  const row = {
    cell_std: "0.04166666666666666667",
    island: true,
    spent: false,
    resource: "diamonds",
    owner_account: null,
    claimed_hours: null,
    cap: null,
    pending: 0,
    v2_std: null,
    v2_mode: null,
    v2_life_left: null,
    v2_life_at: null,
    v2_accrue: null,
  };

  it("SQL: флаг клетки и «уже чинили» — колонками", () => {
    const sql = cellStateSql("isle_x", 1, 2).replace(/\s+/g, " ");
    expect(sql).toContain("COALESCE(c.building_config->>'island' = 'true', false) AS island");
    expect(sql).toContain("o.kind = 'repair' AND o.map_id = c.map_id AND o.q = c.q AND o.r = c.r");
    expect(sql).toContain(") AS spent");
  });

  it("ничья новая: сломана, цена острова, алмаз — шаг сутки", () => {
    const st = mineCellState(row, T0, "isle_x");
    expect(st.view).toMatchObject({
      broken: true,
      island: true,
      spent: false,
      stepHours: 24,
      repairCost: { wood: 100, stone: 100 },
    });
    expect((st.view?.stdYield ?? 0) * 24).toBeCloseTo(1, 12);
    expect(mineCellState({ ...row, spent: true }, T0, "isle_x").view?.spent).toBe(true);
  });

  it("работает 30 ч: выход 1/24 в час, шаг 24, до поломки 168 ч", () => {
    const st = mineCellState(
      {
        ...row,
        owner_account: "acc_me",
        claimed_hours: 0,
        spent: true,
        v2_std: row.cell_std,
        v2_mode: "base",
        v2_life_left: 1,
        v2_life_at: T0,
        v2_accrue: T0,
        cap: T0,
      },
      T0 + 30 * H,
      "isle_x",
    );
    expect(st.owner).toBe("acc_me");
    expect(st.live?.maxHours).toBe(168);
    expect(st.view).toMatchObject({ island: true, stepHours: 24, broken: false });
  });

  it("флаг на карте мира: цена мира, числа — как считает база (по флагу)", () => {
    const st = mineCellState(row, T0, "maze");
    expect(st.view).toMatchObject({ island: false, stepHours: 24 });
    expect(st.view?.repairCost).toEqual({ wood: 10_000, stone: 1_000 });
  });
});
