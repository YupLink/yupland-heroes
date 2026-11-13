// «Управление шахтами»: сбор прямо из окна (владелец, 25.10.2026). Без здания
// и вне замка — отказ до базы; сбор одной шахты — тот же вызов базы, что в
// «Добыче» и окне шахты (mine-claim-core); повтор не задваивает (база отдаёт
// 0 — рассылки нет); отбитая — «шахта уже не твоя»; «Собрать всё» — со всех
// шахт окна, отбитую пропускает, отнятые (§8.71) не трогает — они в «Добыче».
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";

type Fn = (a: { data?: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  events: [] as unknown[],
  built: true,
  atCastle: true,
  /** Что отдаёт raid_mine_claim по клетке «map:q,r»; нет — 0; "lost" — отбита. */
  claim: new Map<string, number | "lost">(),
  cells: [] as Array<Record<string, unknown>>,
  rows: {} as Record<string, MineRow[]>,
  lostClaimed: 0,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data?: unknown } = {}) =>
      fn({ data: v ? v(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("@/server/api/beta-raid/castle", () => ({
  requireAtCastle: async () => {
    if (!s.atCastle) throw new Error("Это делается в замке — дойди до замка");
  },
}));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({ myMapId: async () => "map_b" }));
vi.mock("@/server/api/beta-raid/mine-pendings", () => ({
  ownedMineRows: async (mapId: string) => s.rows[mapId] ?? [],
}));
vi.mock("@/server/api/beta-raid/mine-lost/mine-lost-claim", () => ({
  claimLostRows: async () => {
    s.lostClaimed++;
    return { credited: {} };
  },
}));
vi.mock("@/server/api/achievements/bump", () => ({ bumpAchievement: () => {} }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/FROM yuplink.castle_building/.test(sql)) return [{ owned: s.built }];
    if (/raid_mine_level/.test(sql)) return s.cells;
    const m = /raid_mine_claim\('([^']+)', (-?\d+), (-?\d+), /.exec(sql);
    if (!m) return [];
    const v = s.claim.get(`${m[1]}:${m[2]},${m[3]}`) ?? 0;
    if (v === "lost") throw new Error("MCP: mine_not_owner");
    return [{ amt: v, cfg: { resource: "wood" } }];
  },
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: (e: unknown) => void s.events.push(e) }));

const { officeClaimMine, officeClaimAllMines } = await import("./mine-office-claim");
const { claimMine } = await import("@/server/api/beta-raid/mine-claim");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });
const claimSql = () => s.sql.filter((x) => x.includes("raid_mine_claim"));

const life = { mode: "base" as const, lifeLeft: 1, lifeAt: "2026-10-25T00:00:00.000Z", breakAt: 9e15, broken: false };
const row = (mapId: string, q: number, r: number, resource: MineRow["resource"] = "wood"): MineRow => ({
  mapId, q, r, resource, token: null, yield: 10, claimedHours: 0, capturedAt: 0, maxHours: null, stepHours: 1, v2: life,
});
const cell = (map_id: string, q: number, r: number) => ({ map_id, q, r, place: map_id, level: 1 });

beforeEach(() => {
  Object.assign(s, { sql: [], events: [], built: true, atCastle: true, claim: new Map(), lostClaimed: 0 });
  s.cells = [cell("map_a", 1, 0), cell("map_b", 3, -2)];
  s.rows = { map_a: [row("map_a", 1, 0)], map_b: [row("map_b", 3, -2, "stone")] };
});

describe("отказы до базы", () => {
  it("без здания и вне замка — ни одного сбора", async () => {
    s.built = false;
    await expect(call(officeClaimMine, { mapId: "map_a", q: 1, r: 0 })).rejects.toThrow("mineoffice.not_built");
    await expect(call(officeClaimAllMines)).rejects.toThrow("mineoffice.not_built");
    s.built = true;
    s.atCastle = false;
    await expect(call(officeClaimMine, { mapId: "map_a", q: 1, r: 0 })).rejects.toThrow(/в замке/);
    await expect(call(officeClaimAllMines)).rejects.toThrow(/в замке/);
    expect(claimSql()).toEqual([]);
  });
});

describe("сбор одной шахты", () => {
  it("тот же вызов базы, что в «Добыче»; рассылка по карте шахты", async () => {
    s.claim.set("map_b:3,-2", 30);
    expect(await call(officeClaimMine, { mapId: "map_b", q: 3, r: -2 })).toEqual({ ok: true, amount: 30 });
    const remote = claimSql();
    expect(remote).toHaveLength(1);
    expect(remote[0]).toContain("raid_mine_claim('map_b', 3, -2, 'acc_me')");
    expect(s.events).toEqual([{ mapId: "map_b", type: "built", mine: true, cells: ["3,-2"] }]);
    s.sql = [];
    await call(claimMine, { q: 3, r: -2 });
    expect(claimSql()).toEqual(remote);
  });
  it("повтор — база отдаёт 0: не задваивает, рассылки нет", async () => {
    expect(await call(officeClaimMine, { mapId: "map_a", q: 1, r: 0 })).toEqual({ ok: true, amount: 0 });
    expect(s.events).toEqual([]);
  });
  it("отбитая — «шахта уже не твоя»", async () => {
    s.claim.set("map_a:1,0", "lost");
    await expect(call(officeClaimMine, { mapId: "map_a", q: 1, r: 0 })).rejects.toThrow("braid.mine_not_owner");
  });
});

describe("«Собрать всё»", () => {
  it("со всех шахт окна на всех картах; итог по ресурсам", async () => {
    s.claim.set("map_a:1,0", 20);
    s.claim.set("map_b:3,-2", 2);
    expect(await call(officeClaimAllMines)).toEqual({ ok: true, credited: { wood: 20, stone: 2 } });
    expect(claimSql()).toHaveLength(2);
    expect(s.events).toHaveLength(2);
    // Несобранное с отнятых — в «Добыче», окно его не берёт.
    expect(s.lostClaimed).toBe(0);
  });
  it("отбитая между открытием окна и нажатием — пропущена, остальные собраны", async () => {
    s.claim.set("map_a:1,0", "lost");
    s.claim.set("map_b:3,-2", 2);
    expect(await call(officeClaimAllMines)).toEqual({ ok: true, credited: { stone: 2 } });
  });
  it("повтор — всё уже собрано: пусто", async () => {
    expect(await call(officeClaimAllMines)).toEqual({ ok: true, credited: {} });
    expect(s.events).toEqual([]);
  });
  it("перехваченная в окно не попадает: её клетки нет среди своих", async () => {
    s.cells = [cell("map_b", 3, -2)];
    s.claim.set("map_a:1,0", 20);
    s.claim.set("map_b:3,-2", 2);
    expect(await call(officeClaimAllMines)).toEqual({ ok: true, credited: { stone: 2 } });
    expect(claimSql().some((x) => x.includes("'map_a'"))).toBe(false);
  });
});
