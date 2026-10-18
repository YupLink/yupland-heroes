// «Выпил» — строка журнала для турнира «Зелья скорости» (drink-note.ts): ключ
// товара как у стека рюкзака, ключ повтора — аккаунт и ключ нажатия.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock("@/server/api/beta-raid/econ/trade-journal", () => ({
  noteTrade: async (row: Record<string, unknown>) => void s.rows.push(row),
}));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc1" }));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  canonCustomMeta: async (id: string) =>
    id === "cst_d" ? { name: "Дурман зелье", image: null } : null,
}));

import { drinkTrade, noteDrink } from "@/server/api/beta-raid/econ/drink-note";

beforeEach(() => (s.rows = []));

describe("выпил — в журнал", () => {
  it("строка «use»: ключ товара по имени, ключ повтора — аккаунт + нажатие", () => {
    expect(drinkTrade({ account: "acc1", name: "Дурман зелье", qty: 3, op: "op1" })).toEqual(
      expect.objectContaining({
        accountId: "acc1",
        source: "drink",
        side: "use",
        itemKey: "custom:name:дурман зелье",
        qty: 3,
        ref: "drink:acc1:op1",
      }),
    );
    expect(drinkTrade({ account: "acc1", name: " ", qty: 1, op: "op1" })).toBeNull();
  });

  it("повтор нажатия — тот же ключ; товар без справочника — без строки", async () => {
    await noteDrink({ wallet: "w1", canon: "cst_d", qty: 2, op: "op9" });
    await noteDrink({ wallet: "w1", canon: "cst_d", qty: 2, op: "op9" });
    expect(s.rows.map((r) => r.ref)).toEqual(["drink:acc1:op9", "drink:acc1:op9"]);
    await noteDrink({ wallet: "w1", canon: "cst_x", qty: 1, op: "op10" });
    expect(s.rows).toHaveLength(2);
  });
});
