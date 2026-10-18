// Обмен «товар за товар» в маркете — обе стороны в журнале (владелец,
// 06.10.2026): полученное в обмен — «купил» без золота (не добыча), отданное
// товаром — «заплатил»; «любой артефакт» — по шаблонам реально снятых.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketItem } from "@/lib/marketItem";
import type { TradeNote } from "@/server/api/beta-raid/econ/trade-journal";

const st = vi.hoisted(() => ({
  rows: [] as TradeNote[],
  trades: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/server/api/beta-raid/econ/trade-journal", () => ({
  noteTrades: async (rows: TradeNote[]) => void st.rows.push(...rows),
}));
vi.mock("@/server/api/beta-raid/econ/trade-hooks", () => ({
  noteMarketTrade: async (o: Record<string, unknown>) => void st.trades.push(o),
}));
vi.mock("@/server/api/beta-raid/econ/canon-key", () => ({
  marketTradeKey: async (m: { kind: string; refId: string | null; name: string }) =>
    m.kind === "custom" ? `custom:name:${m.name.toLowerCase()}` : `${m.kind}:${m.refId}`,
}));
const NAMES: Record<string, string> = {
  cst_iron: "Слиток Железа",
  cst_gold: "Слиток золота",
  cst_apple: "Яблоко",
  cst_fish: "Рыба",
  art_X: "Нож",
  art_Y: "Меч",
};
vi.mock("@/server/api/beta-raid/market-payout-meta", () => ({
  payoutMeta: async (_r: string, t: string | null) =>
    t ? { name: NAMES[t] ?? t, image: null } : null,
}));

import { noteMarketBuy, noteMarketSell } from "@/server/api/beta-raid/econ/exchange-note";

const base: MarketItem = {
  id: "mkt_1",
  q: 28,
  r: 68,
  pos: 0,
  side: "sell",
  kind: "art",
  refId: "art_any_epic",
  giveAmount: 1,
  giveToken: null,
  name: "Любой эпический артефакт",
  image: null,
  priceResource: "custom",
  priceToken: "cst_iron",
  priceAmount: 5,
  price2Resource: "custom",
  price2Token: "cst_gold",
  price2Amount: 2,
  stock: null,
  sold: 0,
  perAccountLimit: null,
  buyerMode: "all",
  buyerRaces: [],
  buyerSpecs: [],
};
const ctx = { account: "acc_a", mapId: "m", ref: "mkt-sell:mkt_1:acc_a:n1" };
const arts = (...tpls: string[]) => ({
  paidArts: tpls.map((t, i) => ({ id: `ugi_${i}`, templateId: t })),
});
const pick = (r: TradeNote) => [r.side, r.itemKey, r.qty, r.priceCur ?? null, r.ref];

afterEach(() => {
  st.rows.length = 0;
  st.trades.length = 0;
});

describe("скупка с выплатой товаром", () => {
  it("«любой артефакт» → слитки: отданное по шаблонам, полученное — «купил» ценой отданного", async () => {
    const payouts = [
      { res: "custom" as const, token: "cst_iron", amount: 15 },
      { res: "custom" as const, token: "cst_gold", amount: 6 },
    ];
    await noteMarketSell({
      ...ctx,
      item: base,
      qty: 3,
      ratio: 1,
      payouts,
      receipt: arts("art_X", "art_X", "art_Y"),
    });
    expect(st.trades).toEqual([]);
    expect(st.rows.map(pick)).toEqual([
      ["sell", "art:art_X", 2, "custom:cst_iron", `${ctx.ref}:a0`],
      ["sell", "art:art_Y", 1, "custom:cst_iron", `${ctx.ref}:a1`],
      ["buy", "custom:name:слиток железа", 15, "art:art_any_epic", `${ctx.ref}:got0`],
      ["buy", "custom:name:слиток золота", 6, "art:art_any_epic", `${ctx.ref}:got1`],
    ]);
    expect(st.rows[0].total).toBe(10);
    expect(st.rows[2].total).toBe(3);
  });

  it("молоко → яблоки: отданное — прежней строкой, полученное — «купил»; ресурс тоже", async () => {
    const milk = {
      ...base,
      kind: "custom" as const,
      refId: "cst_milk",
      name: "Молоко",
      price2Resource: null,
    };
    const payouts = [
      { res: "custom" as const, token: "cst_apple", amount: 4 },
      { res: "wood" as const, token: null, amount: 10 },
    ];
    await noteMarketSell({ ...ctx, item: milk, qty: 2, ratio: 1, payouts, receipt: {} });
    expect(st.trades).toEqual([expect.objectContaining({ side: "sell", units: 2 })]);
    expect(st.rows.map(pick)).toEqual([
      ["buy", "custom:name:яблоко", 4, "custom:name:молоко", `${ctx.ref}:got0`],
      ["buy", "resource:wood", 10, "custom:name:молоко", `${ctx.ref}:got1`],
    ]);
  });

  it("скупка за золото и токены — второй строки нет", async () => {
    const milk = { ...base, kind: "custom" as const, refId: "cst_milk", name: "Молоко" };
    const payouts = [
      { res: "gold" as const, token: null, amount: 10 },
      { res: "token" as const, token: "Darai", amount: 5 },
    ];
    await noteMarketSell({ ...ctx, item: milk, qty: 1, ratio: 1, payouts, receipt: {} });
    expect(st.trades).toHaveLength(1);
    expect(st.rows).toEqual([]);
  });
});

describe("покупка с ценой товаром", () => {
  const potion: MarketItem = {
    ...base,
    side: "buy",
    kind: "custom",
    refId: "cst_potion",
    name: "Дурман зелье",
    priceResource: "custom",
    priceToken: "cst_fish",
    priceAmount: 2,
    price2Resource: "gold",
    price2Token: null,
    price2Amount: 1,
  };

  it("полученное — прежней строкой, отданный товар — «заплатил», золото цены — нет", async () => {
    await noteMarketBuy({ ...ctx, item: potion, qty: 3, delivered: 3, receipts: [{}, {}] });
    expect(st.trades).toEqual([expect.objectContaining({ side: "buy", units: 3 })]);
    expect(st.rows.map(pick)).toEqual([["pay", "custom:name:рыба", 6, null, `${ctx.ref}:pay0:0`]]);
  });

  it("цена «любым артефактом» — по снятым шаблонам; недодача — долей", async () => {
    const item = {
      ...potion,
      priceResource: "art" as const,
      priceToken: "art_any_rare",
      priceAmount: 1,
      price2Resource: null,
    };
    await noteMarketBuy({
      ...ctx,
      item,
      qty: 2,
      delivered: 1,
      receipts: [arts("art_X", "art_Y"), {}],
    });
    expect(st.rows.map(pick)).toEqual([
      ["pay", "art:art_X", 0.5, null, `${ctx.ref}:pay0:0`],
      ["pay", "art:art_Y", 0.5, null, `${ctx.ref}:pay0:1`],
    ]);
  });

  it("цена DARAI или энергией — «заплатил» не пишется", async () => {
    const item = {
      ...potion,
      priceResource: "token" as const,
      priceToken: "Darai",
      price2Resource: "energy" as const,
    };
    await noteMarketBuy({ ...ctx, item, qty: 1, delivered: 1, receipts: [{}, {}] });
    expect(st.rows).toEqual([]);
  });
});
