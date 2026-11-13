// Выдача рецепта (ПРАВИЛА §8.104): бросок на каждую штуку, выпавшее — общей
// выдачей; «Ничего» засчитано; не легло — вернётся ценой (delivered < qty).
import { describe, expect, it, vi } from "vitest";
import type { MarketItem } from "@/lib/marketItem";
import { deliverRecipe, outcomeItem, rollRecipe } from "./market-recipe";

const base: MarketItem = {
  id: "mkt_r",
  q: 0,
  r: 0,
  pos: 0,
  side: "buy",
  kind: "recipe",
  refId: null,
  giveAmount: 1,
  giveToken: null,
  name: "Рецепт",
  image: null,
  priceResource: "custom",
  priceToken: "cst_apple",
  priceAmount: 1,
  price2Resource: "diamonds",
  price2Token: null,
  price2Amount: 1,
  stock: null,
  sold: 0,
  perAccountLimit: null,
  buyerMode: "all",
  buyerRaces: [],
  buyerSpecs: [],
  outcomes: [],
};

const out = (id: string, kind: string, refId: string | null, amount: number, pct: number) => ({
  id,
  kind,
  refId,
  amount,
  name: id,
  image: null,
  pct,
});

const opts = (outcomes: unknown[], qty = 1) => ({
  wallet: "w",
  account: "acc",
  item: { ...base, outcomes: outcomes as MarketItem["outcomes"] },
  qty,
  payRef: "mkt:x",
  nonce: "n1",
});

describe("market-recipe", () => {
  it("исход становится обычным товаром: ресурс — суммой, предмет — штукой", () => {
    const res = outcomeItem(base, out("o_d", "resource", "diamonds", 10, 1) as never);
    expect(res).toMatchObject({ kind: "resource", refId: "diamonds", giveAmount: 10 });
    const it = outcomeItem(base, out("o_a", "custom", "cst_a", 3, 1) as never);
    expect(it).toMatchObject({ kind: "custom", refId: "cst_a", giveAmount: 1, outcomes: null });
  });

  it("100 % одного приза: выдан он, штуками N × выпало", async () => {
    const give = vi.fn(async (o: { qty: number }) => ({
      target: "backpack" as const,
      delivered: o.qty,
    }));
    const r = await deliverRecipe(opts([out("o_a", "custom", "cst_a", 2, 100)], 3), give);
    expect(give).toHaveBeenCalledTimes(1);
    expect(give.mock.calls[0][0]).toMatchObject({ qty: 6 });
    expect(r.delivered).toBe(3);
    expect(r.prizes).toEqual([
      { kind: "custom", refId: "cst_a", name: "o_a", image: null, count: 6 },
    ]);
  });

  it("«Ничего» — выдано без выдачи", async () => {
    const give = vi.fn();
    const r = await deliverRecipe(
      opts([out("o_n", "none", null, 1, 100), out("o_a", "custom", "cst_a", 1, 0)], 2),
      give,
    );
    expect(give).not.toHaveBeenCalled();
    expect(r.delivered).toBe(2);
    expect(r.prizes[0]).toMatchObject({ kind: "none", count: 2 });
  });

  it("приз не лёг и ничего не выдано — бросок (полный откат наверху)", async () => {
    const give = vi.fn(async () => {
      throw new Error("market.backpack_full");
    });
    await expect(
      deliverRecipe(opts([out("o_a", "custom", "cst_a", 1, 100)]), give),
    ).rejects.toThrow("market.backpack_full");
  });

  it("рецепт без приза — отказ", async () => {
    await expect(deliverRecipe(opts([out("o_n", "none", null, 1, 100)]), vi.fn())).rejects.toThrow(
      "market.give_failed",
    );
  });

  it("бросок честный: на 20 000 штук доли близки к заданным", () => {
    const list = [out("o_a", "custom", "a", 1, 90), out("o_b", "custom", "b", 1, 10)] as never;
    const hits = rollRecipe(list, 20_000);
    const a = (hits.get("o_a") ?? 0) / 20_000;
    expect(a).toBeGreaterThan(0.88);
    expect(a).toBeLessThan(0.92);
  });
});
