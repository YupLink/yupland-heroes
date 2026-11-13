// Маркет карты без билетов (§8.61): цена «в билетах» берётся золотом ×500, её
// откат по квитанции — тем же ×500; товар/выплата «билеты» — золото ×100.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ ev: [] as string[], err: null as string | null }));
vi.mock("@/server/db/pg", () => ({
  sb: {
    rpc: async (fn: string, a: Record<string, unknown>) => {
      st.ev.push(`${fn}:${a.p_resource}:${a.p_delta}:${a.p_kind}:${a.p_ref}`);
      return { data: [{ applied: true }], error: st.err ? { message: st.err } : null };
    },
  },
}));
vi.mock("@/server/api/heroes-shared", () => ({}));
vi.mock("@/server/api/currency/spend", () => ({}));
vi.mock("@/server/api/currency/pay-darai-map", () => ({ DARAI_TOKEN: "Darai" }));
vi.mock("@/server/api/raid-helpers", () => ({ grantRaidReward: vi.fn() }));
vi.mock("@/server/api/energy-credit", () => ({}));
vi.mock("@/server/api/currency/move", () => ({}));
vi.mock("@/server/api/beta-raid/market-art-pay", () => ({}));
vi.mock("@/server/api/beta-raid/econ/energy-note", () => ({}));

const { credit, spend } = await import("@/server/api/beta-raid/market-money");

beforeEach(() => {
  st.ev = [];
  st.err = null;
});

describe("маркет: цена и товар «в билетах» — золото", () => {
  it("цена 3 билета — списано 1500 золота, квитанция помнит ×500", async () => {
    const r = await spend("w", "acc", "tickets", null, 3, "mkt:1");
    expect(st.ev).toEqual(["res_move:gold:-1500:market_buy:mkt:1"]);
    expect(r.ticketsAsGold).toBe(true);
  });

  it("не хватает золота — market.not_enough", async () => {
    st.err = "res_move: в минус";
    await expect(spend("w", "acc", "tickets", null, 1, "mkt:2")).rejects.toThrow(
      "market.not_enough",
    );
  });

  it("откат цены по квитанции — те же 1500, частичный — пропорционально", async () => {
    await credit("w", "acc", "tickets", null, 3, "mkt:1:undo", { ticketsAsGold: true });
    await credit("w", "acc", "tickets", null, 1, "mkt:1:undoPart", { ticketsAsGold: true });
    expect(st.ev).toEqual([
      "res_move:gold:1500:market_sell:mkt:1:undo",
      "res_move:gold:500:market_sell:mkt:1:undoPart",
    ]);
  });

  it("товар/выплата «билеты» без квитанции — золото ×100", async () => {
    await credit("w", "acc", "tickets", null, 2, "mkt:1:give");
    expect(st.ev).toEqual(["res_move:gold:200:market_sell:mkt:1:give"]);
  });
});
