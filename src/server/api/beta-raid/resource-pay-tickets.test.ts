// Строка цены «в билетах» (порталы, шлагбаумы, стройка, заклинания, бусты,
// Забвение, турнир) с 20.10.2026 платится золотом ×500 (§8.61) — под ключом
// строки (…:i:tickets), чтобы разбор зависших записей турнира нашёл её след.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  calls: [] as Array<{ resource: string; delta: number; kind: string; ref: string }>,
  short: "",
}));

vi.mock("@/server/db/pg", () => ({
  sb: {
    rpc: async (
      _fn: string,
      a: { p_resource: string; p_delta: number; p_kind: string; p_ref: string },
    ) => {
      if (a.p_resource === s.short && a.p_delta < 0)
        return { error: { message: "res_move: в минус" } };
      s.calls.push({ resource: a.p_resource, delta: a.p_delta, kind: a.p_kind, ref: a.p_ref });
      return { error: null };
    },
  },
}));
vi.mock("@/server/api/currency/move", () => ({
  accAccountId: async (w: string) => `acc_${w}`,
  accMove: async () => ({}),
}));
vi.mock("@/server/api/heroes-shared", () => ({}));
vi.mock("@/server/api/currency/spend", () => ({}));
vi.mock("@/server/api/raid-helpers", () => ({
  grantRaidReward: async () => {
    throw new Error("билеты больше не начисляются возвратом");
  },
}));
vi.mock("@/server/api/energy-credit", () => ({}));

import { payResources, refundResources } from "@/server/api/beta-raid/resource-pay";

const price = [{ resource: "tickets" as const, amount: 3 }];

beforeEach(() => {
  s.calls = [];
  s.short = "";
});

describe("цена в билетах — золото ×500", () => {
  it("портал: 3 билета → 1500 золота, ключ строки прежний", async () => {
    await payResources("w", price, "portal:m:1,2:n");
    expect(s.calls).toEqual([
      { resource: "gold", delta: -1500, kind: "portal", ref: "portal:m:1,2:n:0:tickets" },
    ]);
  });

  it("возврат — тем же золотом ×500 (не ×100, как награда)", async () => {
    await refundResources("w", price, "tour:t1:acc:n", {
      kind: "tour_fee",
      refundKind: "tour_fee_refund",
    });
    expect(s.calls).toEqual([
      {
        resource: "gold",
        delta: 1500,
        kind: "tour_fee_refund",
        ref: "tour:t1:acc:n:0:tickets:back",
      },
    ]);
  });

  it("не хватает золота — отказ, ничего не списано", async () => {
    s.short = "gold";
    await expect(payResources("w", price, "gate:m:1,2:n")).rejects.toThrow("Не хватает ресурсов");
    expect(s.calls).toEqual([]);
  });
});
