// Групповая покупка на Рынке за золото (владелец, 21.10.2026). Сама пачка —
// SQL market_buy_batch (chipmkt-gold-01); здесь — обёртка: нехватка золота до
// вызова базы, перевод отказов базы, журнал сделок в золоте, повтор пачки.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  gold: 0,
  goldQueue: [] as number[],
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  reply: { data: null as unknown, error: null as null | { message: string } },
  notes: [] as Array<Record<string, unknown>>,
}));

// Долг (§8.129): у покупателя в этих сценариях долга нет.
vi.mock("./debt/debt-read", () => ({ assertNoDebt: async () => {}, openDebt: async () => null }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => (a?: { data?: unknown }) =>
      fn({ data: v ? v(a?.data) : a?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("../auth", () => ({ getCurrentWallet: () => "b.near" }));
vi.mock("../maintenance", () => ({ assertNotMaintenance: () => {} }));
vi.mock("../rateGate", () => ({ moneyGate: async () => {} }));
vi.mock("../chipRest", () => ({ CHIP_REST_MS: 3_600_000 }));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc_B" }));
vi.mock("./gold-move", () => ({ goldOf: async () => st.goldQueue.shift() ?? st.gold }));
vi.mock("./chips-market-lock", () => ({ MARKET_LOCKED: "locked", marketLockedFor: async () => false }));
vi.mock("./beta-raid/econ/trade-hooks", () => ({
  noteChipMarketSale: async (n: Record<string, unknown>) => void st.notes.push(n),
}));
vi.mock("../db/pg", () => ({
  MARKET_FEES_WALLET: "_market_fees",
  sb: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      st.rpc.push({ fn, args });
      return st.reply;
    },
  },
}));

const { buyMarketListings } = await import("./market-batch-buy");
const buy = (listingIds: string[], expectedTotal: number, opId = "op-12345678") =>
  buyMarketListings({ data: { listingIds, expectedTotal, opId } });

const bought = (id: string, price: number) => ({
  id, price, chipId: `c_${id}`, seller: "acc_S", sellerWallet: "s.near", sellerGot: Math.round(price * 91) / 100,
});

beforeEach(() => {
  st.gold = 1000;
  st.goldQueue = [];
  st.rpc = [];
  st.reply = { data: null, error: null };
  st.notes = [];
});

describe("пачка за золото", () => {
  it("не хватает золота — отказ до базы, «нужно N, у тебя M»", async () => {
    st.gold = 120.9;
    await expect(buy(["L1", "L2"], 250)).rejects.toThrow("Не хватает золота: нужно 250, у тебя 120");
    expect(st.rpc).toEqual([]);
  });

  it("покупает пачкой: база получает сумму и ключ, журнал сделок — в золоте", async () => {
    st.reply = {
      data: [{ result: { bought: [bought("L2", 100), bought("L1", 50)], mine: [], failed: [{ id: "L3", reason: "gone" }], spent: 150 } }],
      error: null,
    };
    const r = await buy(["L1", "L2", "L3"], 175);
    expect(st.rpc).toEqual([
      {
        fn: "market_buy_batch",
        args: expect.objectContaining({
          p_buyer_account: "acc_B", p_buyer_wallet: "b.near", p_ids: ["L1", "L2", "L3"],
          p_expected: 175, p_op: "op-12345678", p_fee_pct: 9, p_rest_seconds: 3600,
        }),
      },
    ]);
    expect(r.results).toEqual([
      { id: "L1", status: "bought", price: 50 },
      { id: "L2", status: "bought", price: 100 },
      { id: "L3", status: "failed", reason: "gone" },
    ]);
    expect(r.spent).toBe(150);
    expect(st.notes.map((n) => [n.listingId, n.priceCur, n.price, n.sellerGot])).toEqual([
      ["L2", "gold", 100, 91],
      ["L1", "gold", 50, 45.5],
    ]);
  });

  it("повтор той же пачки: купленное — «уже твоё», без списания и без журнала", async () => {
    st.reply = { data: [{ result: { bought: [], mine: [{ id: "L1", price: 50 }], failed: [], spent: 0 } }], error: null };
    const r = await buy(["L1"], 50);
    expect(r).toEqual({ results: [{ id: "L1", status: "mine", price: 50 }], spent: 0 });
    expect(st.notes).toEqual([]);
  });

  it("золото кончилось внутри базы (гонка) — вся пачка откатана, отказ той же формы", async () => {
    st.reply = { data: null, error: { message: "res_move: в минус" } };
    st.goldQueue = [1000, 30]; // до базы хватало, к ответу базы — уже нет
    await expect(buy(["L1"], 50)).rejects.toThrow("Не хватает золота: нужно 50, у тебя 30");
    expect(st.rpc).toHaveLength(1);
  });

  it("список устарел — понятный отказ", async () => {
    st.reply = { data: null, error: { message: "market_batch_stale" } };
    await expect(buy(["L1"], 50)).rejects.toThrow("Список на экране устарел");
  });
});
