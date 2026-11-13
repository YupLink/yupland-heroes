// Магазин золота не открывает обратно билеты (§8.61): старые ручки покупки
// билетов со счёта и за энергию/перевод по-прежнему отказывают до любых
// проверок и денег — одной фразой TICKETS_GONE.
import { describe, expect, it, vi } from "vitest";
import { TICKETS_GONE } from "../tickets-shop-closed";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => (a?: { data?: unknown }) =>
      Promise.resolve().then(() => fn({ data: v ? v(a?.data) : a?.data }));
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
// Ни база, ни счёт не должны понадобиться: отказ — первой строкой ручки.
const touched = vi.hoisted(() => ({ n: 0 }));
const tripwire = () =>
  new Proxy(
    {},
    {
      get: () => {
        touched.n++;
        throw new Error("touched");
      },
    },
  );
vi.mock("../../db/pg", () => ({ pg: tripwire(), sb: tripwire() }));
vi.mock("../../maintenance", () => ({
  assertNotMaintenance: () => {
    touched.n++;
  },
}));
vi.mock("../../rateGate", () => ({
  moneyGate: async () => {
    touched.n++;
  },
}));
vi.mock("../account-rollout", () => ({
  requireAccountUser: async () => {
    touched.n++;
    return "w1.near";
  },
}));

describe("закрытые ручки билетов", () => {
  it("покупка билетов со счёта отказывает до любых проверок", async () => {
    const { buyTicketsFromAccount } = await import("../user-shop-account-pay");
    await expect(
      buyTicketsFromAccount({
        data: { offerId: "o1", quantity: 1, opId: "op_12345678", token: "STARS" },
      }),
    ).rejects.toThrow(TICKETS_GONE);
    expect(touched.n).toBe(0);
  });
});
