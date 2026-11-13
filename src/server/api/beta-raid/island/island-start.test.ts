// Старт героя на острове: ставит режим бога только на острове, запись —
// одним оператором с проверкой клетки; клетка не подошла — понятный отказ.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  god: { wallet: "designer.near", mapId: "isle_jzVNmDJP4t", money: false } as unknown,
  sql: [] as Array<{ sql: string; opts: Record<string, unknown> }>,
  read: [{ q: "20", r: "32" }] as unknown[],
  wrote: [{ map_id: "isle_jzVNmDJP4t" }] as unknown[],
  demo: false,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = {
      inputValidator: () => fn,
      handler: (h: (a: { data: unknown }) => unknown) => (a?: { data: unknown }) =>
        h(a ?? { data: undefined }),
    };
    return fn;
  },
}));
vi.mock("./island-editor-auth", () => ({
  requireGodAdmin: async () => {
    if (!s.god) throw new Error("Доступ запрещён: требуется admin-кошелёк");
    return s.god;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string, opts: Record<string, unknown>) => {
    s.sql.push({ sql, opts });
    if (opts.wrapJson && /^\s*(UPDATE|INSERT|DELETE)/i.test(sql))
      throw new Error("wrapJson на записи");
    if (s.demo && /UPDATE yuplink\.raid_island\b/.test(sql)) return [];
    return /UPDATE/.test(sql) ? s.wrote : s.read;
  },
}));

const api = await import("./island-start");
const call = (f: unknown, data?: unknown) =>
  (f as (a: { data: unknown }) => Promise<unknown>)({ data });

beforeEach(() => {
  s.god = { wallet: "designer.near", mapId: "isle_jzVNmDJP4t", money: false };
  s.sql = [];
  s.read = [{ q: "20", r: "32" }];
  s.wrote = [{ map_id: "isle_jzVNmDJP4t" }];
  s.demo = false;
});

describe("старт героя на острове", () => {
  it("на своём острове — видно, где старт, и можно ставить", async () => {
    expect(await call(api.getIslandStart)).toEqual({ canSet: true, start: { q: 20, r: 32 } });
  });

  it("не остров или нет прав — строки нет", async () => {
    s.god = { wallet: "admin.near", mapId: "beta_main", money: true };
    expect(await call(api.getIslandStart)).toEqual({ canSet: false, start: null });
    s.god = null;
    expect(await call(api.getIslandStart)).toEqual({ canSet: false, start: null });
    expect(s.sql).toEqual([]);
  });

  it("запись — одним UPDATE с проверкой клетки, через wrapJsonCte", async () => {
    expect(await call(api.setIslandStart, { q: 18, r: 30 })).toEqual({ start: { q: 18, r: 30 } });
    const w = s.sql.at(-1)!;
    expect(w.opts).toEqual({ wrapJsonCte: true });
    expect(w.sql).toContain("jsonb_build_object('q', 18, 'r', 30)");
    expect(w.sql).toContain("map_id = 'isle_jzVNmDJP4t'");
    for (const part of ["c.object_id IS NULL", "void_fog", "raid_town", "вод|water"]) {
      expect(w.sql).toContain(part);
    }
  });

  it("демо-остров: старт пишется в его строку (raid_demo_island)", async () => {
    s.demo = true;
    expect(await call(api.setIslandStart, { q: 7, r: 8 })).toEqual({ start: { q: 7, r: 8 } });
    const w = s.sql.map((x) => x.sql).filter((q) => q.includes("UPDATE"));
    expect(w).toHaveLength(2);
    expect(w[0]).toContain("UPDATE yuplink.raid_island");
    expect(w[1]).toContain("UPDATE yuplink.raid_demo_island");
  });

  it("клетка не подошла — отказ «island.start_bad_cell»", async () => {
    s.wrote = [];
    await expect(call(api.setIslandStart, { q: 0, r: 0 })).rejects.toThrow("island.start_bad_cell");
  });

  it("админ не на острове — отказ без записи", async () => {
    s.god = { wallet: "admin.near", mapId: "beta_main", money: true };
    await expect(call(api.setIslandStart, { q: 1, r: 1 })).rejects.toThrow(
      "island.start_not_island",
    );
    expect(s.sql).toEqual([]);
  });

  it("без прав — отказ", async () => {
    s.god = null;
    await expect(call(api.setIslandStart, { q: 1, r: 1 })).rejects.toThrow("Доступ запрещён");
  });
});
