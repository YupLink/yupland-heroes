// Правка пула (29.10.2026): комиссия — всегда, курс — только у пустого пула; запрошен
// курс у наполненного — не меняется ничего. Только админ. База подменена памятью:
// UPDATE исполняется над одной строкой пула по тем же условиям WHERE.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Pool = {
  id: string;
  weight_a: number;
  weight_b: number;
  reserve_a: number;
  reserve_b: number;
  fee_pct: number;
};

const st = vi.hoisted(() => ({
  admin: true,
  pool: null as Pool | null,
  sql: [] as string[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a?: { data?: unknown }) =>
      fn({ data: v ? v(a?.data) : a?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("../../auth", () => ({
  isAdminWallet: () => st.admin,
  requireWallet: () => "p.near",
  requireAdmin: () => {
    if (!st.admin) throw new Error("Доступ запрещён: требуется admin-кошелёк");
    return "p.near";
  },
}));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${v.replace(/'/g, "''")}'` }));
vi.mock("./bank-access", () => ({ bankAccount: async () => "acc_P" }));
vi.mock("./bank-tokens", () => ({ bankTokens: async () => [] }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sql.push(sql);
    const p = st.pool;
    if (!p || !sql.includes(`'${p.id}'`)) return [];
    if (/^SELECT/.test(sql.trim())) return [{ id: p.id }];
    if (/reserve_a = 0 AND reserve_b = 0/.test(sql) && (p.reserve_a !== 0 || p.reserve_b !== 0))
      return [];
    const fee = /fee_pct = ([\d.]+)/.exec(sql);
    const w = /weight_a = ([\d.]+), weight_b = ([\d.]+)/.exec(sql);
    if (fee) p.fee_pct = Number(fee[1]);
    if (w) [p.weight_a, p.weight_b] = [Number(w[1]), Number(w[2])];
    return [{ id: p.id }];
  },
}));

const { updateBankPool } = await import("./bank-pools");

const full = (): Pool => ({
  id: "bp_gd",
  weight_a: 250,
  weight_b: 1,
  reserve_a: 1000,
  reserve_b: 4,
  fee_pct: 15,
});
const empty = (): Pool => ({
  id: "bp_gp",
  weight_a: 10_000_000,
  weight_b: 10_000,
  reserve_a: 0,
  reserve_b: 0,
  fee_pct: 15,
});

beforeEach(() => {
  st.admin = true;
  st.pool = full();
  st.sql = [];
});

describe("updateBankPool", () => {
  it("наполненный пул: курс не меняется — отказ, и комиссия из того же запроса тоже", async () => {
    await expect(
      updateBankPool({ data: { id: "bp_gd", feePct: 10, weightA: 300, weightB: 1 } }),
    ).rejects.toThrow("Курс меняется только у пустого пула");
    expect(st.pool).toEqual(full());
  });

  it("наполненный пул: комиссия меняется, курс и запасы — нет", async () => {
    await expect(updateBankPool({ data: { id: "bp_gd", feePct: 5 } })).resolves.toEqual({
      ok: true,
    });
    expect(st.pool).toEqual({ ...full(), fee_pct: 5 });
    expect(st.sql[0]).not.toMatch(/weight_a|reserve_a = 0/);
  });

  it("пустой пул: курс и комиссия меняются", async () => {
    st.pool = empty();
    await updateBankPool({ data: { id: "bp_gp", feePct: 10, weightA: 2_000, weightB: 1 } });
    expect(st.pool).toEqual({ ...empty(), weight_a: 2_000, weight_b: 1, fee_pct: 10 });
    expect(st.sql[0]).toMatch(/WHERE id = 'bp_gp' AND reserve_a = 0 AND reserve_b = 0/);
  });

  it("не админ — отказ, база не тронута", async () => {
    st.admin = false;
    await expect(updateBankPool({ data: { id: "bp_gd", feePct: 5 } })).rejects.toThrow(/admin/);
    expect(st.sql).toEqual([]);
    expect(st.pool).toEqual(full());
  });

  it("проверка как при создании: комиссия из списка, вес ≤ 6 знаков, оба веса сразу", async () => {
    await expect(updateBankPool({ data: { id: "bp_gd", feePct: 7 } })).rejects.toThrow(
      /Комиссия не из списка/,
    );
    st.pool = empty();
    await expect(
      updateBankPool({ data: { id: "bp_gp", weightA: 1.0000001, weightB: 1 } }),
    ).rejects.toThrow(/6 знаков/);
    await expect(updateBankPool({ data: { id: "bp_gp", weightA: 5 } })).rejects.toThrow(/оба веса/);
    await expect(updateBankPool({ data: { id: "bp_gp" } })).rejects.toThrow(/Нечего менять/);
    expect(st.sql).toEqual([]);
  });

  it("нет такого пула — «Пул не найден»", async () => {
    await expect(updateBankPool({ data: { id: "bp_none", feePct: 5 } })).rejects.toThrow(
      "Пул не найден",
    );
  });
});
