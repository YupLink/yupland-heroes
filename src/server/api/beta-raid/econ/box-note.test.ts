// Приз мистического бокса — в журнал «купил» за 'box' без цены (владелец,
// 06.10.2026: товар из бокса — не добыча, его продажа в «Золото» прибыли не даёт).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TradeNote } from "@/server/api/beta-raid/econ/trade-journal";

const st = vi.hoisted(() => ({ rows: [] as TradeNote[], fail: false }));

vi.mock("@/server/api/user-shared", () => ({ accountOf: async () => "acc_a" }));
vi.mock("@/server/api/beta-raid/econ/trade-journal", () => ({
  noteTrade: async (r: TradeNote) => {
    if (st.fail) throw new Error("мост упал");
    st.rows.push(r);
  },
}));
vi.mock("@/server/api/beta-raid/econ/canon-key", () => ({
  marketTradeKey: async (m: { refId: string; name: string }) =>
    m.refId === "cst_cuc" ? "custom:name:зимние огурцы" : `custom:name:${m.name}`,
}));

import { noteBoxPrize } from "@/server/api/beta-raid/econ/box-note";

afterEach(() => {
  st.rows.length = 0;
  st.fail = false;
});

describe("приз бокса в журнале", () => {
  it("свой товар — ключ канона, «купил» за box, цена 0, ключ повтора — приз", async () => {
    await noteBoxPrize({
      wallet: "w",
      kind: "custom",
      code: "cst_cuc",
      amount: 13,
      name: "Зимние Огурцы",
      ref: "mystic:g1",
    });
    expect(st.rows).toEqual([
      expect.objectContaining({
        accountId: "acc_a",
        source: "mystic",
        side: "buy",
        itemKey: "custom:name:зимние огурцы",
        qty: 13,
        priceCur: "box",
        total: 0,
        ref: "mystic:g1",
      }),
    ]);
  });

  it("ресурс — resource:<код>; ноль — без строки; сбой записи — не наружу", async () => {
    await noteBoxPrize({
      wallet: "w",
      kind: "resource",
      code: "stone",
      amount: 5,
      ref: "mystic:g2",
    });
    await noteBoxPrize({
      wallet: "w",
      kind: "resource",
      code: "wood",
      amount: 0,
      ref: "mystic:g3",
    });
    expect(st.rows.map((r) => [r.itemKey, r.qty])).toEqual([["resource:stone", 5]]);
    st.fail = true;
    await expect(
      noteBoxPrize({ wallet: "w", kind: "custom", code: "cst_cuc", amount: 1, ref: "mystic:g4" }),
    ).resolves.toBeUndefined();
  });
});
