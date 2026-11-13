// Наполнение пула с основного кошелька игры (29.10.2026): монетная сторона ни с чьего
// счёта не списывается — функция базы bank_pool_fund_main, счёт журнала
// «wallet:<кошелёк>»; хватает ли — по «свободно» (token-free-pool), иначе отказ до
// записи. Ресурсную сторону выпускает игра — «свободно» по ней не спрашивается.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankPool } from "@/lib/castleBank";

const st = vi.hoisted(() => ({
  pools: [] as BankPool[],
  free: {} as Record<string, number | null>,
  asked: [] as string[],
  rpc: [] as Array<{ name: string; args: Record<string, unknown> }>,
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
  requireAdmin: () => "admin.near",
  requireWallet: () => "admin.near",
}));
vi.mock("../../rateGate", () => ({ moneyGate: async () => undefined }));
vi.mock("../currency/move", () => ({ humanizeAccError: (s: string) => s }));
vi.mock("../currency/treasury", () => ({ OPERATING_WALLET: "darai_gdrop.near" }));
vi.mock("../token-free-pool", () => ({
  freeTokenPool: async (symbol: string) => {
    st.asked.push(symbol);
    return { symbol, free: st.free[symbol] ?? null };
  },
}));
vi.mock("./bank-pools", () => ({ listPools: async () => st.pools }));
vi.mock("./bank-license", () => ({ activeLicenseFor: async () => null }));
vi.mock("./license-money", () => ({ runBuyback: async () => undefined }));
vi.mock("./bank-access", () => ({ bankAccount: async () => "acc_P" }));
vi.mock("./bank-tokens", () => ({ bankTokenDp: async () => 0 }));
vi.mock("../../db/pg", () => ({
  sb: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      st.rpc.push({ name, args });
      return { error: null, data: [{ reserve_a: 3000, reserve_b: 3, applied: true }] };
    },
  },
}));

const { fundBankPool } = await import("./bank-swap");

const pool = (p: Partial<BankPool>): BankPool => ({
  id: "bp_gp",
  tokenA: "gold",
  tokenB: "GP",
  weightA: 10_000_000,
  weightB: 10_000,
  reserveA: 1000,
  reserveB: 1,
  feePct: 15,
  createdAt: "2026-10-27",
  dpA: 4,
  dpB: 0,
  ...p,
});
const fund = (poolId: string, amountA: number) =>
  fundBankPool({ data: { poolId, amountA, opId: "op-12345678" } });

beforeEach(() => {
  st.pools = [
    pool({}),
    pool({
      id: "bp_wood",
      tokenB: "wood",
      weightA: 10,
      weightB: 1,
      reserveA: 100,
      reserveB: 10,
      dpB: 4,
    }),
  ];
  st.free = { GP: 5 };
  st.asked = [];
  st.rpc = [];
});

describe("fundBankPool — с основного кошелька", () => {
  it("свободных хватает — пул наполнен функцией без списания со счёта, журнал на кошелёк", async () => {
    await expect(fund("bp_gp", 2000)).resolves.toMatchObject({ amountB: 2 });
    expect(st.asked).toEqual(["GP"]);
    expect(st.rpc).toEqual([
      {
        name: "bank_pool_fund_main",
        args: {
          p_pool: "bp_gp",
          p_wallet: "darai_gdrop.near",
          p_a: 2000,
          p_b: 2,
          p_op: "wallet:darai_gdrop.near:op-12345678",
        },
      },
    ]);
  });

  it("свободных меньше — отказ до записи, с остатком в тексте", async () => {
    st.free = { GP: 1 };
    await expect(fund("bp_gp", 2000)).rejects.toThrow(
      "На основном кошельке не хватает свободных GP: есть 1",
    );
    expect(st.rpc).toEqual([]);
  });

  it("«свободно» не прочиталось (сеть) — отказ до записи", async () => {
    st.free = {};
    await expect(fund("bp_gp", 2000)).rejects.toThrow(/не прочитался/);
    expect(st.rpc).toEqual([]);
  });

  it("ресурсная сторона — выпуск игры, «свободно» не спрашивается", async () => {
    await expect(fund("bp_wood", 50)).resolves.toMatchObject({ amountB: 5 });
    expect(st.asked).toEqual([]);
    expect(st.rpc.map((r) => r.name)).toEqual(["bank_pool_fund_main"]);
  });

  it("миграция bank-13: функция наполнения не трогает счета (ни bank_move, ни acc/res_move)", () => {
    const sql = readFileSync("migrations/bank-13-fund-main.sql", "utf8").replace(/--.*$/gm, "");
    expect(sql).toMatch(/FUNCTION yuplink\.bank_pool_fund_main/);
    expect(sql).not.toMatch(/bank_move|acc_move|res_move/);
    expect(sql).toMatch(/'wallet:' \|\| p_wallet/);
  });
});
