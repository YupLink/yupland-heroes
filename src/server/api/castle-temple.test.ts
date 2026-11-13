// Храм покупается в Ратуше (ПРАВИЛА §8.64): без храма — ни улучшения, ни
// молитвы (база не зовётся); купленный или альфа-тестерский — всё как было.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  owned: false,
  level: 5 as number | null,
  sql: [] as string[],
  rpc: [] as string[],
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
vi.mock("./../auth", () => ({ requireWallet: () => "w_me" }));
vi.mock("./beta-raid/owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./beta-raid/home-castle", () => ({ homeCastleStatus: async () => ({ here: true }) }));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/castle_building/.test(sql))
      return [{ level: s.level, last_prayer_at: null, owned: s.owned }];
    return [];
  },
}));
vi.mock("../db/pg", () => ({
  sb: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      s.rpc.push(fn);
      return { error: null, data: [{ level: Number(args.p_from ?? 0) + 1 }] };
    },
  },
}));

const { getCastleTemple, upgradeCastleTemple, prayCastleTemple } = await import("./castle-temple");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });

beforeEach(() => Object.assign(s, { owned: false, level: 5, sql: [], rpc: [] }));

describe("храм без покупки", () => {
  it("окно знает, что храма нет", async () => {
    const t = (await call(getCastleTemple)) as { owned: boolean; level: number };
    expect(t.owned).toBe(false);
    expect(s.sql[0]).toMatch(/b\.kind = 'temple'/);
  });
  it("улучшить и помолиться нельзя — база не зовётся", async () => {
    await expect(call(upgradeCastleTemple, { fromLevel: 5, opId: "op_12345678" })).rejects.toThrow(
      /купи его в Ратуше/,
    );
    await expect(
      call(prayCastleTemple, { stats: ["atk"], extend: false, opId: "op_12345678" }),
    ).rejects.toThrow(/купи его в Ратуше/);
    expect(s.rpc).toEqual([]);
  });
});

describe("купленный или альфа-тестерский храм", () => {
  it("уровень сохранён, улучшение и молитва идут как раньше", async () => {
    s.owned = true;
    const t = (await call(getCastleTemple)) as { owned: boolean; level: number };
    expect(t).toMatchObject({ owned: true, level: 5 });
    expect(await call(upgradeCastleTemple, { fromLevel: 5, opId: "op_12345678" })).toEqual({
      level: 6,
    });
    await call(prayCastleTemple, { stats: ["atk"], extend: false, opId: "op_12345678" });
    expect(s.rpc).toEqual(["castle_temple_upgrade", "castle_temple_pray"]);
  });
  it("строки храма ещё нет — 1-й уровень", async () => {
    s.owned = true;
    s.level = null;
    expect(((await call(getCastleTemple)) as { level: number }).level).toBe(1);
  });
});
