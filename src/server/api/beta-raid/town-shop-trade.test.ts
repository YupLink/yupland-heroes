// Сделка в лавке города: сначала берём у игрока, склад — только при том запасе,
// от которого посчитана цена; сверка с показанной суммой ДО движений; откаты.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  /** Что вернёт moveStock по очереди: true — склад сдвинулся, false — запас другой. */
  casOk: [] as boolean[],
  /** Свежий запас для повторной попытки. */
  fresh: 100,
  log: [] as string[],
  spends: [] as Array<{ res: string; amount: number; ref: string }>,
  credits: [] as Array<{ res: string; amount: number; ref: string }>,
  moves: [] as Array<{ ref: string; kind: string; units?: number; at?: number; delta?: number }>,
  deliverThrows: false,
  creditThrows: false,
  stockAfter: {} as Record<string, number>,
  starving: [] as boolean[],
  published: [] as string[][],
  /** Любой поход в базу (кассы у ратуши больше нет — их быть не должно). */
  sql: [] as string[],
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sql.push(sql);
    return [];
  },
}));
vi.mock("../../raidLive", () => ({
  publishRaid: (e: { cells: string[] }) => st.published.push(e.cells),
}));
vi.mock("./econ/trade-hooks", () => ({ noteTownTrade: async () => undefined }));
vi.mock("./market-undo-alert", () => ({ reportUndoFailure: async () => undefined }));
vi.mock("./market-deliver", () => ({
  deliverGood: async (o: { qty: number }) => {
    if (st.deliverThrows) throw new Error("deliver failed");
    st.log.push("deliver");
    return { target: "backpack", delivered: o.qty };
  },
}));
vi.mock("./market-money", () => ({
  spend: async (_w: string, _a: string, res: string, _t: unknown, amount: number, ref: string) => {
    st.spends.push({ res, amount, ref });
    st.log.push(`spend:${res}`);
    return {};
  },
  credit: async (_w: string, _a: string, res: string, _t: unknown, amount: number, ref: string) => {
    if (st.creditThrows && res === "gold") throw new Error("credit failed");
    st.credits.push({ res, amount, ref });
    st.log.push(`credit:${res}`);
  },
}));
vi.mock("./town-stock", () => ({
  moveStock: async (
    _t: unknown,
    _g: string,
    ref: string,
    m: { kind: string; units?: number; at?: number; delta?: number },
  ) => {
    st.moves.push({ ref, ...m });
    st.log.push(`stock:${m.kind}`);
    if (m.kind === "undo") return { before: 0, after: 0, fresh: true };
    const ok = st.casOk.length ? st.casOk.shift() : true;
    return ok ? { before: m.at ?? 0, after: m.at ?? 0, fresh: true } : null;
  },
  readTownStock: async () => ({ tg_bread: st.fresh, ...st.stockAfter }),
}));
vi.mock("./town-state", async (orig) => ({
  ...(await orig<typeof import("./town-state")>()),
  setStarving: async (_t: unknown, on: boolean) => {
    st.starving.push(on);
  },
}));

import { cityBuy, citySell } from "./town-shop-trade";
import { quoteBuy, quoteSell, townCurve } from "@/lib/townPricing";
import { defaultTownRules } from "@/lib/townRules";
import type { CityShop } from "./town-shop";
import type { MarketItem } from "@/lib/marketItem";

const bread = {
  id: "tg_bread",
  kind: "custom" as const,
  refId: "cst_bread",
  token: null,
  operation: "both" as const,
  marketPrice: 10,
  consumePerResident: 0.1,
  producePerDay: 0,
};
const city = (starving = false): CityShop => ({
  town: { mapId: "m", q: 0, r: 0 },
  cfg: { name: "", residents: 100, rules: defaultTownRules(), goods: [bread] },
  stock: { tg_bread: 100 },
  starving,
});
// giveAmount 2 у своего товара: покупка всё равно выдаёт по штуке (market-deliver).
const item = (side: "buy" | "sell") =>
  ({
    id: "mkt_1",
    q: 3,
    r: 4,
    side,
    kind: "custom",
    refId: "cst_bread",
    giveToken: null,
    giveAmount: 2,
    name: "Хлеб",
  }) as unknown as MarketItem;
const base = { wallet: "w", account: "acc", mapId: "m", payRef: "mkt:1", nonce: "n" };
const curve = townCurve(bread, 100, defaultTownRules());
const total = (q: ReturnType<typeof quoteBuy>) => (q.ok ? q.total : -1);

beforeEach(() => {
  Object.assign(st, {
    casOk: [],
    fresh: 100,
    log: [],
    spends: [],
    credits: [],
    moves: [],
    deliverThrows: false,
    creditThrows: false,
    stockAfter: {},
    starving: [],
    published: [],
    sql: [],
  });
});

describe("покупка в лавке города", () => {
  it("сначала золото, потом склад — ровно при том запасе, от которого цена", async () => {
    const t = total(quoteBuy(curve, 100, 5));
    await cityBuy({ ...base, item: item("buy"), qty: 5, city: city(), expect: t });
    expect(st.log).toEqual(["spend:gold", "stock:take", "deliver"]);
    expect(st.spends[0]).toEqual({ res: "gold", amount: t, ref: "mkt:1:p1" });
    // Кассы у ратуши нет: золото игрока никуда не копится (16.10.2026).
    expect(st.sql.some((q) => q.includes("town_cash"))).toBe(false);
    // Свой товар: 5 единиц позиции = 5 штук со склада, а не 10.
    expect(st.moves[0]).toMatchObject({ kind: "take", units: 5, at: 100 });
  });

  it("склад успел сдвинуться — золото назад, пересчёт по свежему запасу", async () => {
    st.casOk = [false, true];
    st.fresh = 99;
    const first = total(quoteBuy(curve, 100, 5));
    const second = total(quoteBuy(curve, 99, 5));
    await cityBuy({ ...base, item: item("buy"), qty: 5, city: city(), expect: second });
    expect(st.spends.map((s) => s.ref)).toEqual(["mkt:1:p1", "mkt:1:p2"]);
    expect(st.credits).toEqual([{ res: "gold", amount: first, ref: "mkt:1:p1:undo" }]);
    expect(st.moves[1]).toMatchObject({ kind: "take", at: 99 });
  });

  it("цена хуже показанной — отказ ДО денег и склада", async () => {
    await expect(
      cityBuy({ ...base, item: item("buy"), qty: 5, city: city(), expect: 1 }),
    ).rejects.toThrow("market.price_changed");
    expect(st.log).toEqual([]);
  });

  it("без показанной суммы (старая вкладка) — отказ, обновиться", async () => {
    await expect(cityBuy({ ...base, item: item("buy"), qty: 5, city: city() })).rejects.toThrow(
      "market.price_changed",
    );
    expect(st.log).toEqual([]);
  });

  it("ниже НЗ не продаём — отказ до денег", async () => {
    await expect(
      cityBuy({ ...base, item: item("buy"), qty: 91, city: city(), expect: 1e9 }),
    ).rejects.toThrow("market.sold_out");
    expect(st.log).toEqual([]);
  });

  it("товар не выдался — золото назад и склад обратно", async () => {
    st.deliverThrows = true;
    await expect(
      cityBuy({ ...base, item: item("buy"), qty: 5, city: city(), expect: 1e9 }),
    ).rejects.toThrow();
    expect(st.credits.map((c) => c.ref)).toEqual(["mkt:1:p1:undo"]);
    expect(st.moves.at(-1)).toMatchObject({ kind: "undo", delta: 5 });
  });

  it("в голод лавка города не продаёт", async () => {
    await expect(
      cityBuy({ ...base, item: item("buy"), qty: 1, city: city(true), expect: 1e9 }),
    ).rejects.toThrow("town.starving");
  });
});

describe("продажа лавке города", () => {
  it("товар игрока — первым, склад — при том же запасе, золото — по кривой", async () => {
    const t = total(quoteSell(curve, 100, 6));
    await citySell({ ...base, item: item("sell"), qty: 3, city: city(), expect: t });
    expect(st.log).toEqual(["spend:custom", "stock:put", "credit:gold"]);
    // Скупка забирает giveAmount × qty: 6 штук.
    expect(st.spends[0]).toMatchObject({ res: "custom", amount: 6 });
    expect(st.credits).toEqual([{ res: "gold", amount: t, ref: "mkt:1:pay" }]);
  });

  it("обещали больше, чем даст кривая — отказ ДО того, как взяли товар", async () => {
    await expect(
      citySell({ ...base, item: item("sell"), qty: 3, city: city(), expect: 1e9 }),
    ).rejects.toThrow("market.price_changed");
    expect(st.log).toEqual([]);
  });

  it("золото не начислилось — товар вернули, склад обратно", async () => {
    st.creditThrows = true;
    await expect(
      citySell({ ...base, item: item("sell"), qty: 3, city: city(), expect: 0 }),
    ).rejects.toThrow();
    expect(st.credits.map((c) => `${c.res}:${c.ref}`)).toEqual(["custom:mkt:1:undo"]);
    expect(st.moves.at(-1)).toMatchObject({ kind: "undo", delta: -6 });
  });

  it("золото — из ниоткуда: кассы нет, отказа «нет денег» не бывает", async () => {
    const t = total(quoteSell(curve, 100, 600));
    await citySell({ ...base, item: item("sell"), qty: 300, city: city(), expect: t });
    expect(st.credits).toEqual([{ res: "gold", amount: t, ref: "mkt:1:pay" }]);
    expect(st.sql.some((q) => q.includes("town_cash"))).toBe(false);
  });

  it("голодному городу привезли еду до нормы — голод снят, окна города перечитаются", async () => {
    st.stockAfter = { tg_bread: 100 };
    await citySell({ ...base, item: item("sell"), qty: 3, city: city(true), expect: 0 });
    expect(st.starving).toEqual([false]);
    expect(st.published.at(-1)).toEqual([]);
  });
});
