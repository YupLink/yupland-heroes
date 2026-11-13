// Энергопак за золото (§8.61): цена ступени «в билетах» со скидкой подписки ×
// 500; не хватает — отказ до вызова базы; оплата и выдача — одна SQL-функция
// (ветка 'gold'); ошибка с квитанцией (повтор моста) — это успех.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  ev: [] as string[],
  gold: 10_000,
  disc: 0,
  rpcErr: null as string | null,
  done: null as null | { amount: number },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../db/pg", () => ({
  pg: {
    energyPacks: {
      findOne: async () => ({
        id: "p1",
        active: true,
        amount: 100,
        price_tickets: 5,
        price_steps: [],
        daily_limit: 0,
      }),
    },
    energyPackPurchases: { findFirst: async () => st.done },
  },
  sb: {
    rpc: async (fn: string, a: Record<string, unknown>) => {
      st.ev.push(`${fn}:${a.p_pay_with}:${a.p_tickets_price}`);
      if (st.rpcErr) return { data: null, error: { message: st.rpcErr } };
      return { data: [{ energy_added: 100 }], error: null };
    },
  },
}));
vi.mock("../db/mcpClient", () => ({ mcpExec: async () => [] }));
vi.mock("../maintenance", () => ({ assertNotMaintenance: () => {} }));
vi.mock("../buildGate", () => ({ requireFreshClient: () => {} }));
vi.mock("../auth", () => ({ getCurrentWallet: () => "w1", isAdminWallet: () => false }));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc1" }));
vi.mock("./gold-move", () => ({ goldOf: async () => st.gold }));
vi.mock("./user", () => ({
  getSisterWallets: async () => ["w1"],
  fetchSubscriptionDiscount: async () => ({ discountPct: st.disc }),
}));
vi.mock("./energy-packs-steps", () => ({ pricingOf: () => [], requireCurrencyPrice: vi.fn() }));

const { buyEnergyPackViaTickets } = await import("./energy-packs-buy");
const buy = buyEnergyPackViaTickets as unknown as (a: {
  data: { packId: string; gold?: true };
}) => Promise<{ energyAdded: number; goldSpent: number }>;

beforeEach(() => Object.assign(st, { ev: [], gold: 10_000, disc: 0, rpcErr: null, done: null }));

describe("энергопак за золото", () => {
  it("старая вкладка без признака gold — отказ «обнови страницу», база не трогается", async () => {
    await expect(buy({ data: { packId: "p1" } })).rejects.toThrow(
      "Обнови страницу — цены теперь в золоте",
    );
    expect(st.ev).toEqual([]);
  });

  it("5 билетов → 2500 золота, функция зовётся веткой gold", async () => {
    expect(await buy({ data: { packId: "p1", gold: true } })).toMatchObject({
      energyAdded: 100,
      goldSpent: 2500,
    });
    expect(st.ev).toEqual(["buy_energy_pack_atomic:gold:5"]);
  });

  it("скидка подписки 15% — 4.25 билета → 2125 золота", async () => {
    st.disc = 15;
    expect((await buy({ data: { packId: "p1", gold: true } })).goldSpent).toBe(2125);
    expect(st.ev).toEqual(["buy_energy_pack_atomic:gold:4.25"]);
  });

  it("не хватает золота — отказ до базы", async () => {
    st.gold = 2499;
    await expect(buy({ data: { packId: "p1", gold: true } })).rejects.toThrow(
      "Не хватает золота: нужно 2500, у тебя 2499",
    );
    expect(st.ev).toEqual([]);
  });

  it("отказ базы not_enough_gold — словами", async () => {
    st.rpcErr = "not_enough_gold:100:2500";
    await expect(buy({ data: { packId: "p1", gold: true } })).rejects.toThrow(
      "Не хватает золота: нужно 2500, у тебя 100",
    );
  });

  it("ошибка, но квитанция есть (повтор моста) — успех без возврата", async () => {
    st.rpcErr = "MCP timeout";
    st.done = { amount: 100 };
    expect(await buy({ data: { packId: "p1", gold: true } })).toMatchObject({ energyAdded: 100 });
  });
});
