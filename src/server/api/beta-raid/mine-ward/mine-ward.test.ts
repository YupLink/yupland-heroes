// Замок шахтёра (владелец, 09.11.2026, §8.123): Шахтёр лично у своей шахты за 40 ⚡
// ставит замок на 3 ч; захват под замком отказывает до энергии, а замок, вставший
// между проверкой и захватом, — внутри захвата (энергия назад). Один замок за раз.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wardClock, wardErrorKey } from "@/lib/mineWard";
import { ISLAND_PREFIX } from "@/lib/raid/island/ids";

const s = vi.hoisted(() => {
  const fresh = () => ({
    owner: "acc_me" as string | null,
    ability: "miner" as string | null,
    left: 0,
    locked: false,
    putError: null as string | null,
    adjacent: true,
    mapId: "rmap_1",
    sql: [] as string[],
    rpc: [] as Array<{ f: string; a: Record<string, unknown> }>,
  });
  return Object.assign(fresh(), { fresh });
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("@/server/db/pg", () => ({
  sb: {
    rpc: async (f: string, a: Record<string, unknown>) => (s.rpc.push({ f, a }), { error: null }),
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("raid_mine_ward_put(")) {
      if (s.putError) throw new Error(s.putError);
      return [{ res: { placed: true, again: false, paid: 40 } }];
    }
    if (sql.includes('AS "leftMs"')) return s.left > 0 ? [{ leftMs: s.left }] : [];
    if (sql.includes("raid_mine_capture(")) {
      return [{ _row: { captured: !s.locked, locked: s.locked } }];
    }
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "me.tg" }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  myMapId: async () => s.mapId,
  playerCell: async () => ({ q: 2, r: 2 }),
  requireAdjacent: () => {
    if (!s.adjacent) throw new Error("Подойди вплотную");
  },
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("@/server/api/beta-raid/building-action", () => ({
  loadCellBuilding: async () => ({
    buildingId: "b1",
    effect: "mine",
    tier: 0,
    tiers: [{}],
    config: { resource: "gold", yield: 5, captureCost: 10 },
    meta: {},
  }),
}));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("@/server/api/beta-raid/mine-v2-read", () => ({
  loadMineCell: async () => ({ owner: s.owner, view: null, capturedAt: null, claimedHours: 0 }),
  mineV2ErrorKey: (m: string) => m,
}));
vi.mock("@/server/api/beta-raid/hero-load", () => ({
  loadSelectedHero: async () => ({ heroId: "h1", ability: s.ability }),
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

type Call = (a: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
const put = (await import("./mine-ward")).putMineWard as unknown as Call;
const capture = (await import("../mine-capture")).captureMine as unknown as Call;
const { mineExtra } = await import("../mine-extra");

const press = () => put({ data: { q: 3, r: 2, opId: "op_abcdef" } });
const puts = () => s.sql.filter((x) => x.includes("raid_mine_ward_put("));
const extra = () =>
  mineExtra({
    built: true,
    wallet: "me.tg",
    mapId: s.mapId,
    q: 3,
    r: 2,
    cellConfig: { resource: "gold", yield: 5, captureCost: 10 },
  }) as Promise<Record<string, unknown>>;

beforeEach(() => void Object.assign(s, s.fresh()));

describe("поставить замок", () => {
  it("Шахтёр у своей шахты: 40 ⚡ и 3 ч одной функцией базы, ключ нажатия — свой", async () => {
    s.left = 0;
    const res = await press();
    expect(res).toMatchObject({ ok: true, energy: 40 });
    const sql = puts()[0].replace(/\s+/g, " ");
    expect(sql).toContain(
      "raid_mine_ward_put('mward:acc_me:op_abcdef', 'rmap_1', 3, 2, 'acc_me', 'b1', 40::numeric, 3::numeric)",
    );
  });

  it("не своя, не Шахтёр, уже стоит, не вплотную — отказ до базы", async () => {
    const cases: Array<[Partial<typeof s>, string]> = [
      [{ owner: "acc_other" }, "mine.ward_not_yours"],
      [{ owner: null }, "mine.ward_not_yours"],
      [{ ability: "fisher" }, "mine.ward_need_miner"],
      [{ ability: null }, "mine.ward_need_miner"],
      [{ left: 60_000 }, "mine.ward_active"],
      [{ adjacent: false }, "Подойди вплотную"],
    ];
    for (const [patch, err] of cases) {
      Object.assign(s, s.fresh(), patch);
      await expect(press()).rejects.toThrow(err);
      expect(puts()).toEqual([]);
    }
  });

  it("энергии мало — «Нужно 40 энергии»; гонка «уже стоит» — ключом", async () => {
    s.putError = "bridge: not_enough_energy:12:40";
    await expect(press()).rejects.toThrow('braid.need_energy|{"n":40}');
    s.putError = "bridge: ward_active";
    await expect(press()).rejects.toThrow("mine.ward_active");
  });

  it("остров новичка — со скидкой острова (×0,1)", async () => {
    s.mapId = `${ISLAND_PREFIX}test`;
    expect(await press()).toMatchObject({ energy: 4 });
    expect(puts()[0]).toContain("4::numeric");
  });
});

describe("захват под замком", () => {
  it("живой замок — отказ до энергии, захвата нет", async () => {
    Object.assign(s, { owner: "acc_other", left: 90_000 });
    await expect(capture({ data: { q: 3, r: 2 } })).rejects.toThrow("mine.ward_locked");
    expect(s.rpc).toEqual([]);
    expect(s.sql.some((x) => x.includes("raid_mine_capture("))).toBe(false);
  });

  it("замок встал между проверкой и захватом — отказ, энергия назад", async () => {
    Object.assign(s, { owner: "acc_other", locked: true });
    await expect(capture({ data: { q: 3, r: 2 } })).rejects.toThrow("mine.ward_locked");
    expect(s.rpc.map((x) => x.f)).toEqual(["touch_energy_atomic", "add_energy"]);
  });

  it("замка нет — захват как был", async () => {
    s.owner = "acc_other";
    expect(await capture({ data: { q: 3, r: 2 } })).toMatchObject({ ok: true });
  });
});

describe("окно шахты", () => {
  it("хозяину-Шахтёру — цена замка; не Шахтёру — нет; остаток видят все", async () => {
    expect(await extra()).toMatchObject({ mine: "own", wardEnergy: 40, wardLeftMs: 0 });
    s.ability = "farmer";
    expect((await extra()).wardEnergy).toBeNull();
    Object.assign(s, { owner: "acc_other", left: 5_000 });
    expect(await extra()).toMatchObject({ mine: "enemy", wardEnergy: null, wardLeftMs: 5_000 });
  });

  it("часы и ключи отказов базы", () => {
    expect(wardClock(3 * 3600_000)).toBe("3:00:00");
    expect(wardClock(270_500)).toBe("0:04:31");
    expect(wardErrorKey("x ward_not_owner")).toBe("mine.ward_not_yours");
    expect(wardErrorKey("x ward_gone")).toBe("dmine.gone");
  });
});
