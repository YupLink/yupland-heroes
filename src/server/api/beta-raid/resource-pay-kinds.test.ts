// Вид строк res_ledger у платы: портал и стройка пишут portal/portal_refund
// (как и раньше), запись на турнир — свой tour_fee/tour_fee_refund: его ждёт
// экономика (econ/kinds.ts — сток).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  calls: [] as Array<{ resource: string; delta: number; kind: string; ref: string }>,
  /** Ресурс, которого у игрока нет: res_move отвечает «в минус». */
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
vi.mock("@/server/api/tickets-ledger", () => ({}));
vi.mock("@/server/api/currency/spend", () => ({}));
vi.mock("@/server/api/raid-helpers", () => ({}));
vi.mock("@/server/api/energy-credit", () => ({}));

import { payResources, refundResources } from "@/server/api/beta-raid/resource-pay";

const price = [
  { resource: "gold" as const, amount: 5 },
  { resource: "diamonds" as const, amount: 1 },
];
const TOUR = { kind: "tour_fee", refundKind: "tour_fee_refund" };

beforeEach(() => {
  s.calls = [];
  s.short = "";
});

describe("вид строк платы", () => {
  it("по умолчанию — portal / portal_refund, как у портала и стройки", async () => {
    await payResources("w", price, "portal:m:1,2:n");
    await refundResources("w", price, "portal:m:1,2:n");
    expect(s.calls.map((c) => c.kind)).toEqual([
      "portal",
      "portal",
      "portal_refund",
      "portal_refund",
    ]);
  });

  it("турнир — tour_fee; сорвалась вторая строка — откат первой видом tour_fee_refund", async () => {
    s.short = "diamonds";
    await expect(payResources("w", price, "tour:t1:acc:n", TOUR)).rejects.toThrow(
      "Не хватает ресурсов",
    );
    expect(s.calls).toEqual([
      { resource: "gold", delta: -5, kind: "tour_fee", ref: "tour:t1:acc:n:0:gold" },
      { resource: "gold", delta: 5, kind: "tour_fee_refund", ref: "tour:t1:acc:n:0:gold:back" },
    ]);
  });

  it("возврат снаружи (отметка оплаты не легла) — тоже своим видом", async () => {
    await refundResources("w", price.slice(0, 1), "tour:t1:acc:n", TOUR);
    expect(s.calls).toEqual([
      { resource: "gold", delta: 5, kind: "tour_fee_refund", ref: "tour:t1:acc:n:0:gold:back" },
    ]);
  });
});
