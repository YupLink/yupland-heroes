// DARAI-шахту не захватывают (владелец, 22.10.2026: «захват = положить в
// рюкзак»): обычный захват отказывает до списания энергии и до записи
// владения; прочие шахты захватываются по-прежнему. Окно DARAI-шахты знает,
// что игрок поднимал её последним, — «Забрать» выключен с причиной.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  config: { resource: "token", token: "Darai", yield: 1000, captureCost: 10 } as Record<
    string,
    unknown
  >,
  rpc: [] as string[],
  sql: [] as string[],
  owner: "acc_other" as string | null,
  lastTaker: null as string | null,
  ripeAt: null as number | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/db/pg", () => ({
  sb: {
    rpc: async (f: string) => {
      s.rpc.push(f);
      return { error: null };
    },
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return [{ _row: { captured: true } }];
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "me.tg" }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  myMapId: async () => "rmap_1",
  playerCell: async () => ({ q: 2, r: 2 }),
  requireAdjacent: () => {},
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("@/server/api/beta-raid/building-action", () => ({
  loadCellBuilding: async () => ({
    buildingId: "b1",
    effect: "mine",
    tier: 0,
    tiers: [{}],
    config: s.config,
    meta: {},
  }),
}));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("@/server/api/beta-raid/mine-v2-read", () => ({
  loadMineCell: async () => ({ owner: s.owner, view: null, capturedAt: null, claimedHours: 0 }),
  mineV2ErrorKey: (m: string) => m,
}));
vi.mock("@/server/api/beta-raid/mine-guard", () => ({
  requireMineGuardDefeated: async () => {},
  clearDefeatedGuard: async () => {},
  loadGuardRow: async () => null,
  guardViewIfAlive: () => null,
}));
vi.mock("@/server/api/beta-raid/econ/energy-note", () => ({ noteEnergySpend: async () => {} }));
vi.mock("@/server/api/beta-raid/hero-satiety", () => ({ moveSatiety: async () => {} }));
vi.mock("@/server/raidLive", () => ({ publishRaid: () => {} }));
vi.mock("@/server/api/beta-raid/dmine/dmine-last-taker", () => ({
  dmineCellRow: async () => ({ takenBy: s.lastTaker, ripeAt: s.ripeAt }),
}));

const { captureMine } = await import("../mine-capture");
const { mineExtra } = await import("../mine-extra");
const capture = captureMine as unknown as (a: {
  data: { q: number; r: number };
}) => Promise<unknown>;
const extra = () =>
  mineExtra({ built: true, wallet: "me.tg", mapId: "rmap_1", q: 3, r: 2, cellConfig: s.config });

beforeEach(() => {
  s.config = { resource: "token", token: "Darai", yield: 1000, captureCost: 10 };
  s.rpc.length = 0;
  s.sql.length = 0;
  s.owner = "acc_other";
  s.lastTaker = null;
  s.ripeAt = null;
});

describe("захват DARAI-шахты", () => {
  it("отказ «забирают в рюкзак» — без энергии и без записи владения", async () => {
    await expect(capture({ data: { q: 3, r: 2 } })).rejects.toThrow("dmine.capture_is_take");
    expect(s.rpc).toEqual([]);
    expect(s.sql).toEqual([]);
  });

  it("прочая шахта — захват как раньше: энергия и raid_mine_capture", async () => {
    s.config = { resource: "token", token: "magicdust", yield: 1, captureCost: 10 };
    await expect(capture({ data: { q: 3, r: 2 } })).resolves.toMatchObject({ ok: true });
    expect(s.rpc).toEqual(["touch_energy_atomic"]);
    expect(s.sql.some((x) => x.includes("raid_mine_capture("))).toBe(true);
  });
});

describe("окно DARAI-шахты: одно поднятие до размещения", () => {
  it("последним поднимал я — «Забрать» выключен с причиной dmine.once", async () => {
    s.lastTaker = "acc_me";
    await expect(extra()).resolves.toMatchObject({ can: false, reasonKey: "dmine.once" });
  });

  it("поднимал другой (или ни разу) — можно", async () => {
    s.lastTaker = "acc_other";
    await expect(extra()).resolves.toMatchObject({ can: true, reasonKey: null });
    s.lastTaker = null;
    await expect(extra()).resolves.toMatchObject({ can: true, reasonKey: null });
  });

  it("золотой и алмазный грибы — те же правила: вид в окне, «Забрать» за 5, захвата нет", async () => {
    s.config = { resource: "gold", yield: 1, captureCost: 10, mushroom: "gold" };
    await expect(extra()).resolves.toMatchObject({ mushroom: "gold", captureCost: 5, can: true });
    await expect(capture({ data: { q: 3, r: 2 } })).rejects.toThrow("dmine.capture_is_take");
    s.config = { resource: "diamonds", yield: 1, mushroom: "diamonds" };
    await expect(extra()).resolves.toMatchObject({ mushroom: "diamonds", captureCost: 5 });
    // Золотая шахта (не гриб) — окно шахты как было.
    s.config = { resource: "token", token: "magicdust", yield: 1, captureCost: 10 };
    await expect(extra()).resolves.toMatchObject({ mushroom: null, captureCost: 10 });
  });

  it("созревает (защита на час) — время в окне всем; «Забрать» не выключен: отказ — от сервера", async () => {
    s.ripeAt = Date.now() + 30 * 60_000;
    await expect(extra()).resolves.toMatchObject({ ripeAt: s.ripeAt, can: true });
    s.owner = "acc_me";
    await expect(extra()).resolves.toMatchObject({ ripeAt: s.ripeAt, mine: "own" });
    // Не гриб — строки гриба не читаем.
    s.config = { resource: "token", token: "magicdust", yield: 1, captureCost: 10 };
    await expect(extra()).resolves.toMatchObject({ ripeAt: null });
  });

  it("своя — не забрать (хозяину кнопки нет)", async () => {
    s.owner = "acc_me";
    await expect(extra()).resolves.toMatchObject({ can: false, mine: "own" });
  });
});
