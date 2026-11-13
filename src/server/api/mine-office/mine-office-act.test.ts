// «Управление шахтами» (25.10.2026): режим и починка удалённо. Без здания,
// вне замка и с чужой шахтой — отказ до базы; со своей — тот же вызов базы,
// та же цена и тот же ключ повтора, что у окна шахты на карте (общее ядро
// mine-v2-core), только без «подойди ближе».
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  events: [] as unknown[],
  built: true,
  atCastle: true,
  near: false,
  owner: "acc_me" as string | null,
  config: { resource: "wood" } as Record<string, unknown>,
  gold: 50,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
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
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  myMapId: async () => "map_a",
  playerCell: async () => ({ q: 0, r: 0 }),
  requireAdjacent: () => {
    if (!s.near) throw new Error("Подойди ближе к объекту");
  },
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("@/server/api/beta-raid/building-action", () => ({
  loadCellBuilding: async () => ({ effect: "mine", tier: 0, tiers: [{}], config: s.config }),
}));
vi.mock("@/server/api/beta-raid/mine-v2-read", async (orig) => ({
  ...(await orig<typeof import("@/server/api/beta-raid/mine-v2-read")>()),
  loadMineCell: async () => ({ owner: s.owner, claimedHours: 0, capturedAt: null, pending: 0, view: null, live: null }),
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/FROM yuplink.castle_building/.test(sql)) return [{ owned: s.built }];
    if (/account_resources/.test(sql)) return [{ resource: "gold", amount: s.gold }];
    if (/raid_mine_repair/.test(sql)) return [{ captured: false, applied: true, credited: 0, credited_to: null }];
    if (/raid_mine_set_mode/.test(sql)) return [{ changed: true, credited: 0 }];
    return [];
  },
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: (e: unknown) => void s.events.push(e) }));

const { officeRepairMine, officeSetMineMode } = await import("./mine-office-act");
const { repairMine, setMineMode } = await import("@/server/api/beta-raid/mine-v2");
const call = (f: unknown, data: unknown) => (f as Fn)({ data });
const mineSql = () => s.sql.filter((x) => /raid_mine_(repair|set_mode)/.test(x));
const cell = { mapId: "map_a", q: 3, r: -2 };

beforeEach(() => {
  Object.assign(s, {
    sql: [],
    events: [],
    built: true,
    atCastle: true,
    near: false,
    owner: "acc_me",
    config: { resource: "wood" },
    gold: 50,
  });
});

describe("отказы до базы", () => {
  it("без здания — отказ, база шахт не зовётся", async () => {
    s.built = false;
    await expect(call(officeSetMineMode, { ...cell, mode: "mid" })).rejects.toThrow("mineoffice.not_built");
    await expect(
      call(officeRepairMine, { ...cell, mode: "base", opId: "op_12345678" }),
    ).rejects.toThrow("mineoffice.not_built");
    expect(mineSql()).toEqual([]);
  });
  it("не в замке — отказ", async () => {
    s.atCastle = false;
    await expect(call(officeSetMineMode, { ...cell, mode: "mid" })).rejects.toThrow(/в замке/);
    await expect(
      call(officeRepairMine, { ...cell, mode: "base", opId: "op_12345678" }),
    ).rejects.toThrow(/в замке/);
    expect(mineSql()).toEqual([]);
  });
  it("чужая шахта (или уже сломанная — ничья) — «шахта не твоя»", async () => {
    for (const owner of ["acc_other", null]) {
      s.owner = owner;
      await expect(call(officeSetMineMode, { ...cell, mode: "mid" })).rejects.toThrow("braid.mine_not_owner");
      await expect(
        call(officeRepairMine, { ...cell, mode: "base", opId: "op_12345678" }),
      ).rejects.toThrow(owner ? "braid.mine_owned" : "braid.mine_not_owner");
    }
    expect(mineSql()).toEqual([]);
  });
  it("остров — режим не меняют, как и на карте", async () => {
    s.config = { resource: "wood", island: true };
    await expect(
      call(officeSetMineMode, { mapId: "isle_acc_me", q: 0, r: 0, mode: "max" }),
    ).rejects.toThrow("braid.mine_island_mode");
  });
  it("нехватка на починку — тот же ключ с числами, что на карте", async () => {
    s.gold = 5;
    await expect(
      call(officeRepairMine, { ...cell, mode: "base", opId: "op_12345678" }),
    ).rejects.toThrow('braid.mine_short_gold|{"n":20,"have":5}');
  });
});

describe("удалённо — то же, что у шахты на карте", () => {
  it("режим: тот же вызов базы и рассылка, без «подойди ближе»", async () => {
    expect(await call(officeSetMineMode, { ...cell, mode: "max" })).toEqual({ ok: true });
    const remote = mineSql();
    s.sql = [];
    await call(setMineMode, { q: 3, r: -2, mode: "max" });
    expect(remote).toHaveLength(1);
    expect(mineSql()).toEqual(remote);
    expect(remote[0]).toContain("raid_mine_set_mode('map_a', 3, -2,");
  });
  it("починка: та же цена и тот же ключ повтора аккаунта", async () => {
    const data = { ...cell, mode: "mid", opId: "op_12345678" };
    expect(await call(officeRepairMine, data)).toEqual({ ok: true, captured: false, applied: true });
    const remote = mineSql();
    expect(remote[0]).toContain(`'{"gold":20}'::jsonb`);
    expect(remote[0]).toContain("'rep:acc_me:op_12345678'");
    s.sql = [];
    s.near = true;
    await call(repairMine, { q: 3, r: -2, mode: "mid", opId: "op_12345678" });
    expect(mineSql()).toEqual(remote);
  });
  it("алмазная — цена мира, как у окна шахты", async () => {
    s.config = { resource: "diamonds" };
    s.gold = 0;
    await expect(
      call(officeRepairMine, { ...cell, mode: "base", opId: "op_12345678" }),
    ).rejects.toThrow(/braid.mine_short_wood/);
  });
  it("карта шахты — любая; плохой ввод отбивает схема", async () => {
    await call(officeSetMineMode, { mapId: "rmap_far", q: 1, r: 1, mode: "mid" });
    expect(mineSql()[0]).toContain("'rmap_far'");
    await expect(call(officeSetMineMode, { mapId: "", q: 1, r: 1, mode: "mid" })).rejects.toThrow();
    await expect(call(officeSetMineMode, { ...cell, mode: "turbo" })).rejects.toThrow();
  });
});
