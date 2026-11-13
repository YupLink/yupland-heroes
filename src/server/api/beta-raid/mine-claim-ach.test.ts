// Сбор с шахт и ачивка «Хозяин шахт» (жалоба 22.10.2026: «награду с дарайной
// шахты 1к1 в ачивку считает»; владелец: «каждые 1к дараи = 1 очко»): DARAI
// гриба начисляется как прежде, в ачивку — очко за 1 000; дерево — 1 к 1. Базы нет.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Cell = { amt: number; cfg: Record<string, unknown> | null };

const s = vi.hoisted(() => ({
  sql: [] as string[],
  cells: new Map<string, { amt: number; cfg: Record<string, unknown> | null }>(),
  bumps: [] as Array<[string, string, number]>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "me.near" }));
vi.mock("../currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({ myMapId: async () => "alpha" }));
vi.mock("./floors", () => ({ floorMaps: async (here: string) => [{ id: here, floor: null }] }));
vi.mock("./mine-pendings", () => ({
  ownedMineRows: async (mapId: string) => [
    { mapId, q: 1, r: 1, resource: "token", token: "Darai", yield: 10000 },
    { mapId, q: 2, r: 2, resource: "wood", token: null, yield: 10 },
  ],
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    const m = /raid_mine_claim\('[^']+', (-?\d+), (-?\d+), /.exec(sql);
    if (!m) return [];
    const c = s.cells.get(`${m[1]},${m[2]}`);
    return c ? [{ amt: c.amt, cfg: c.cfg }] : [{ amt: 0, cfg: null }];
  },
}));
vi.mock("../../raidLive", () => ({ publishRaid: () => {} }));
vi.mock("../achievements/bump", () => ({
  bumpAchievement: (acc: string, track: string, n: number) => s.bumps.push([acc, track, n]),
}));

const { claimMine, claimAllMines } = await import("./mine-claim");
const claimOne = claimMine as unknown as (a: {
  data: { q: number; r: number };
}) => Promise<{ amount: number }>;
const claimAll = claimAllMines as unknown as () => Promise<{ credited: Record<string, number> }>;

const DARAI: Cell = {
  amt: 10000,
  cfg: { resource: "token", token: "Darai", yield: 10000, mushroom: "darai" },
};
const WOOD: Cell = { amt: 30, cfg: { resource: "wood", yield: 10 } };

beforeEach(() => {
  s.sql = [];
  s.cells = new Map([
    ["1,1", DARAI],
    ["2,2", WOOD],
  ]);
  s.bumps = [];
});

describe("«Хозяин шахт» при сборе", () => {
  it("сбор читает настройку той же клетки в том же запросе", async () => {
    await claimOne({ data: { q: 1, r: 1 } });
    expect(s.sql[0]).toContain("raid_mine_claim('alpha', 1, 1, 'acc_me') AS amt");
    expect(s.sql[0]).toContain("FROM yuplink.raid_map_cells c");
    expect(s.sql[0]).toContain("c.map_id = 'alpha' AND c.q = 1 AND c.r = 1) AS cfg");
  });

  it("гриб DARAI: 10 000 начислено, в ачивку — 10 очков", async () => {
    const r = await claimOne({ data: { q: 1, r: 1 } });
    expect(r.amount).toBe(10000);
    expect(s.bumps).toEqual([["acc_me", "minelord", 10]]);
  });

  it("лесопилка: собранное — в ачивку целиком", async () => {
    const r = await claimOne({ data: { q: 2, r: 2 } });
    expect(r.amount).toBe(30);
    expect(s.bumps).toEqual([["acc_me", "minelord", 30]]);
  });

  it("«Собрать со всех»: DARAI на счёт целиком, в ачивку — 10 очков и дерево", async () => {
    const r = await claimAll();
    expect(r.credited).toEqual({ Darai: 10000, wood: 30 });
    expect(s.bumps).toEqual([
      ["acc_me", "minelord", 10],
      ["acc_me", "minelord", 30],
    ]);
  });
});
