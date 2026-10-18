// Цепочки «купил → продал»: свёртка, валюта плеча, сортировка по навару.
import { describe, expect, it } from "vitest";
import type { TradeRow } from "@/lib/econ/types";
import { buildChains } from "./chains";

let seq = 0;
const row = (p: Partial<TradeRow>): TradeRow => ({
  id: ++seq,
  at: "2026-09-20T10:00:00.000Z",
  accountId: "acc1",
  displayName: "@one",
  counterparty: "shop",
  counterpartyName: null,
  mapId: "m",
  q: 1,
  r: 1,
  source: "market",
  side: "buy",
  itemKey: "custom:name:молоко",
  itemName: "Молоко",
  qty: 10,
  priceUnit: 4,
  priceCur: "gold",
  total: 40,
  ref: null,
  ...p,
});

describe("buildChains", () => {
  it("покупка и продажа одного товара — одна цепочка с наваром и местами", () => {
    const chains = buildChains([
      row({ side: "buy", qty: 10, total: 40, q: 1, r: 1, at: "2026-09-20T10:00:00.000Z" }),
      row({ side: "buy", qty: 5, total: 20, q: 1, r: 1, at: "2026-09-20T11:00:00.000Z" }),
      row({
        side: "sell",
        qty: 15,
        total: 90,
        q: 7,
        r: 7,
        source: "town",
        counterparty: "town",
        at: "2026-09-21T10:00:00.000Z",
      }),
    ]);
    expect(chains).toHaveLength(1);
    const c = chains[0];
    expect(c.buys).toMatchObject({ qty: 15, total: 60, cur: "gold" });
    expect(c.buys.places).toEqual([{ mapId: "m", q: 1, r: 1, n: 2, counterparty: "shop" }]);
    expect(c.sells).toMatchObject({ qty: 15, total: 90, cur: "gold" });
    expect(c.sells.places[0]).toMatchObject({ q: 7, r: 7, n: 1, counterparty: "town" });
    expect(c.margin).toBe(30);
    expect(c.marginCur).toBe("gold");
    expect(c.first).toBe("2026-09-20T10:00:00.000Z");
    expect(c.last).toBe("2026-09-21T10:00:00.000Z");
  });

  it("только покупки или только продажи — цепочки нет; полка и ворота не считаются", () => {
    expect(buildChains([row({ side: "buy" })])).toEqual([]);
    expect(buildChains([row({ side: "sell" })])).toEqual([]);
    expect(
      buildChains([
        row({ side: "take", source: "wh_take" }),
        row({ side: "pay", source: "gate" }),
        row({ side: "sell" }),
      ]),
    ).toEqual([]);
  });

  it("разные валюты в плечах — навар null, валюта плеча null при смеси", () => {
    const chains = buildChains([
      row({ side: "buy", priceCur: "gold", total: 40 }),
      row({ side: "buy", priceCur: "Darai", total: 1 }),
      row({ side: "sell", priceCur: "gold", total: 90 }),
    ]);
    expect(chains[0].buys.cur).toBeNull();
    expect(chains[0].margin).toBeNull();
    expect(chains[0].marginCur).toBeNull();
  });

  it("группировка по (игрок, товар); сортировка: навар убыв., null в конец", () => {
    const chains = buildChains([
      row({ accountId: "a", side: "buy", total: 10 }),
      row({ accountId: "a", side: "sell", total: 15 }),
      row({ accountId: "b", side: "buy", total: 10 }),
      row({ accountId: "b", side: "sell", total: 50 }),
      row({ accountId: "c", side: "buy", total: 10, priceCur: "wood" }),
      row({ accountId: "c", side: "sell", total: 50, priceCur: "gold" }),
      row({ accountId: "a", itemKey: "res:wood", itemName: "Дерево", side: "buy", total: 1 }),
      row({ accountId: "a", itemKey: "res:wood", itemName: "Дерево", side: "sell", total: 100 }),
    ]);
    expect(chains.map((c) => `${c.accountId}:${c.itemKey}:${c.margin}`)).toEqual([
      "a:res:wood:99",
      "b:custom:name:молоко:40",
      "a:custom:name:молоко:5",
      "c:custom:name:молоко:null",
    ]);
  });
});
