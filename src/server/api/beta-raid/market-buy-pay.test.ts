// Оплата всеми ингредиентами (до пяти; ПРАВИЛА §8.104 п. 1а): по очереди,
// сбой k-й строки — списанное назад; ключи первых двух — прежние.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ ev: [] as string[], failAt: "" }));
// Чтение баланса для объяснения отказа: золота 40 при цене 100, пепла нет.
vi.mock("./market-buy-short-db", () => ({
  shortDeps: () => ({
    have: async (l: { resource: string; token: string | null }) =>
      l.resource === "gold" ? 40 : l.token === "cst_ash" ? 0 : null,
    itemNames: async (lines: Array<{ token: string | null }>) =>
      lines.map((l) => (l.token === "cst_ash" ? "Пепел" : null)),
  }),
}));
vi.mock("./market-money", () => ({
  spend: async (_w: string, _a: string, res: string, _t: string | null, n: number, ref: string) => {
    if (ref === st.failAt) throw new Error("market.not_enough");
    st.ev.push(`spend:${res}:${n}:${ref}`);
    return {};
  },
  credit: async (
    _w: string,
    _a: string,
    res: string,
    _t: string | null,
    n: number,
    ref: string,
  ) => {
    st.ev.push(`credit:${res}:${n}:${ref}`);
  },
}));

const { payAll, refundAll } = await import("./market-buy-pay");
type PayCtx = import("./market-buy-pay").PayCtx;
const { allPrices, parsePriceMore } = await import("@/lib/marketPrices");

const item = {
  priceResource: "custom" as const,
  priceToken: "cst_apple",
  priceAmount: 2,
  price2Resource: "diamonds" as const,
  price2Token: null,
  price2Amount: 1,
  priceMore: [
    { resource: "gold" as const, token: null, amount: 100 },
    { resource: "custom" as const, token: "cst_ash", amount: 1 },
    { resource: "art" as const, token: "art_ring", amount: 1 },
  ],
};
const ctx = (): PayCtx => ({
  wallet: "w",
  account: "acc",
  lines: allPrices(item),
  payRef: "mkt:x",
  picks: [],
  undoFail: () => () => Promise.resolve(),
});

beforeEach(() => {
  st.ev = [];
  st.failAt = "";
});

describe("ингредиенты цены", () => {
  it("пять строк: первая, вторая, ещё три — по порядку", () => {
    expect(allPrices(item).map((l) => l.resource)).toEqual([
      "custom",
      "diamonds",
      "gold",
      "custom",
      "art",
    ]);
  });

  it("мусор и лишние отсеиваются: без шаблона, ноль, больше трёх", () => {
    const l = parsePriceMore([
      { resource: "custom", token: null, amount: 1 },
      { resource: "gold", token: "x", amount: 0 },
      { resource: "gold", token: "x", amount: 5 },
      { resource: "wood", amount: 1 },
      { resource: "stone", amount: 1 },
      { resource: "energy", amount: 1 },
    ]);
    expect(l).toEqual([
      { resource: "gold", token: null, amount: 5 },
      { resource: "wood", token: null, amount: 1 },
      { resource: "stone", token: null, amount: 1 },
    ]);
  });

  it("списание за 3 штуки — все пять; ключи первых двух прежние", async () => {
    await payAll(ctx(), 3);
    expect(st.ev).toEqual([
      "spend:custom:6:mkt:x",
      "spend:diamonds:3:mkt:x:p2",
      "spend:gold:300:mkt:x:p3",
      "spend:custom:3:mkt:x:p4",
      "spend:art:3:mkt:x:p5",
    ]);
  });

  it("не хватило 4-го — первые три вернулись, бросок словами: чего и сколько", async () => {
    st.failAt = "mkt:x:p4";
    await expect(payAll(ctx(), 1)).rejects.toThrow(
      'market.short|{"ru":"золото 60, Пепел 1","en":"gold 60, Пепел 1"}',
    );
    expect(st.ev.filter((e) => e.startsWith("credit"))).toEqual([
      "credit:custom:2:mkt:x:undo",
      "credit:diamonds:1:mkt:x:undo2",
      "credit:gold:100:mkt:x:undo3",
    ]);
  });

  it("частичный возврат — за недоставленное, ключи undoPart, undoPart2…", async () => {
    const c = ctx();
    const r = await payAll(c, 2);
    st.ev = [];
    await refundAll(c, r, 1, "undoPart");
    expect(st.ev).toEqual([
      "credit:custom:2:mkt:x:undoPart",
      "credit:diamonds:1:mkt:x:undoPart2",
      "credit:gold:100:mkt:x:undoPart3",
      "credit:custom:1:mkt:x:undoPart4",
      "credit:art:1:mkt:x:undoPart5",
    ]);
  });
});
