// Услуга постройки (дерево уровней, покои) с ценой «в билетах» — золото ×500
// видом building (§8.61); повтор ключа — «уже оплачена», а не бесплатно.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ ev: [] as string[], applied: true }));
vi.mock("../currency/move", () => ({ accAccountId: async () => "acc1" }));
vi.mock("../gold-move", () => ({
  goldMove: async (acc: string, delta: number, kind: string, ref: string) => {
    st.ev.push(`${kind}:${acc}:${delta}:${ref}`);
    return st.applied;
  },
}));
vi.mock("./econ/energy-note", () => ({ noteEnergySpendByWallet: () => {} }));

const { payServicePrice } = await import("./building-pay");

beforeEach(() => Object.assign(st, { ev: [], applied: true }));

describe("payServicePrice: tickets → золото", () => {
  it("100 билетов — 50 000 золота", async () => {
    await payServicePrice("w", { kind: "tickets", token: null, amount: 100 }, "tree:o:m:1:2");
    expect(st.ev).toEqual(["building:acc1:-50000:tree:o:m:1:2"]);
  });

  it("ключ уже проведён — отказ", async () => {
    st.applied = false;
    await expect(
      payServicePrice("w", { kind: "tickets", token: null, amount: 1 }, "tree:o:m:1:2"),
    ).rejects.toThrow("Эта постройка уже оплачена");
  });
});
