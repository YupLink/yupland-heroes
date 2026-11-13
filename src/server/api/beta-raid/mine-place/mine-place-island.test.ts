// Остров новичка (ПРАВИЛА §8.59 п. 11): шахту из заготовки там не поставить —
// заготовка дала бы шахту мира; отказ до базы и до рюкзака. В мире — как было.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({ sql: [] as string[], mapId: "isle_abc123", backpack: 0 }));

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
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return /FROM yuplink\.raid_mine_plan/.test(sql)
      ? [{ map_id: s.mapId, q: 1, r: 0, kind: "wood", stack_key: "custom:cst_mine_bp_wood" }]
      : [];
  },
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: () => {} }));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", () => ({
  pchestActor: async () => ({ wallet: "w1.tg", mapId: s.mapId, account: "acc_1" }),
}));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  canonRef: async (_k: string, ref: string | null) => ref,
  refFromStackKey: (k: string) => k.slice(k.indexOf(":") + 1) || null,
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => {
    s.backpack += 1;
    return null;
  },
}));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  playerCell: async () => ({ q: 0, r: 0 }),
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));

const { placeMineBlueprint } = await import("./mine-place");
const place = () => (placeMineBlueprint as unknown as Fn)({ data: { op: "op123456" } });

beforeEach(() => {
  s.sql = [];
  s.backpack = 0;
  s.mapId = "isle_abc123";
});

describe("постановка шахты на острове", () => {
  it("на карте острова — отказ ключом, без базы и рюкзака", async () => {
    await expect(place()).rejects.toThrow("mineplace.island");
    expect(s.sql).toEqual([]);
    expect(s.backpack).toBe(0);
  });

  it("в мире проверка не мешает (дальше — обычные проверки)", async () => {
    s.mapId = "rmap_1";
    await expect(place()).rejects.toThrow("market.backpack_no_hero");
    expect(s.backpack).toBe(1);
  });
});
