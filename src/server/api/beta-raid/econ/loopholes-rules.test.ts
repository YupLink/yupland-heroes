// Эвристики лазеек: пороги и отбор на синтетических данных.
import { describe, expect, it } from "vitest";
import type { ChainRow, DeltaRow } from "@/lib/econ/types";
import {
  findArbitrage,
  findEnergyOutliers,
  findRewardHeavy,
  findShelfTakers,
} from "./loopholes-rules";

const place = (q: number, n = 1) => ({ mapId: "m", q, r: 0, n, counterparty: "shop" });
const chain = (p: Partial<ChainRow>): ChainRow => ({
  accountId: "A",
  displayName: "@a",
  itemKey: "custom:name:молоко",
  itemName: "Молоко",
  buys: { qty: 10, total: 100, cur: "gold", places: [place(1)] },
  sells: { qty: 10, total: 150, cur: "gold", places: [place(2)] },
  margin: 50,
  marginCur: "gold",
  first: "2026-09-01T00:00:00.000Z",
  last: "2026-09-02T00:00:00.000Z",
  ...p,
});

describe("findArbitrage", () => {
  it("навар > 0 и место продажи не совпадает с местом покупки", () => {
    const rows = findArbitrage([chain({})]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "arbitrage", score: 50, displayName: "@a" });
    expect(rows[0].details).toMatchObject({
      buyAvg: 10,
      sellAvg: 15,
      margin: 50,
      from: "m (1,0)",
      to: "m (2,0)",
    });
    expect(rows[0].summary).toContain("навар 50 gold");
  });

  it("то же место, без навара или без общей валюты — не арбитраж", () => {
    expect(
      findArbitrage([chain({ sells: { qty: 10, total: 150, cur: "gold", places: [place(1)] } })]),
    ).toEqual([]);
    expect(findArbitrage([chain({ margin: -5 })])).toEqual([]);
    expect(findArbitrage([chain({ margin: null, marginCur: null })])).toEqual([]);
  });
});

describe("findShelfTakers", () => {
  it("взял больше, чем положил — с топ-3 товаров", () => {
    const rows = findShelfTakers([
      { account_id: "A", item_name: "Молоко", took: "30", put: "5" },
      { account_id: "A", item_name: "Хлеб", took: 10, put: 0 },
      { account_id: "A", item_name: "Сыр", took: 2, put: 0 },
      { account_id: "A", item_name: "Мёд", took: 1, put: 0 },
      { account_id: "B", item_name: "Молоко", took: 5, put: 50 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "shelf_taker", accountId: "A", score: 38 });
    expect(rows[0].details).toMatchObject({
      took: 43,
      put: 5,
      items: "Молоко: 30; Хлеб: 10; Сыр: 2",
    });
  });
});

describe("findEnergyOutliers", () => {
  it("ловит того, кто живёт на подарках: подарков > 1000 и вдвое больше честного прихода", () => {
    const rows = findEnergyOutliers([
      { account_id: "A", spend: 2000, regen: 300, bought: 100, rewards: 200, gifted: 1500 },
      // Много сжёг, но энергия из наград игры — не лазейка.
      { account_id: "B", spend: 9000, regen: 700, bought: 0, rewards: 8000, gifted: 0 },
      // Подарок есть, но покупки больше — честный.
      { account_id: "C", spend: 400, regen: 0, bought: 3000, rewards: 0, gifted: 1200 },
    ]);
    expect(rows.map((r) => r.accountId)).toEqual(["A"]);
    expect(rows[0]).toMatchObject({ kind: "energy_outlier", score: 900 });
    expect(rows[0].details).toEqual({
      gifted: 1500,
      regen: 300,
      bought: 100,
      rewards: 200,
      spend: 2000,
    });
  });
});

describe("findRewardHeavy", () => {
  const delta = (p: Partial<DeltaRow>): DeltaRow => ({
    accountId: "A",
    displayName: "@a",
    telegramUsername: "a",
    currency: "gold",
    earned: 10_000,
    spent: 100,
    net: 9_900,
    byKind: [
      { kind: "acc_reward", group: "reward", amount: 9_700, n: 3 },
      { kind: "gift", group: "gift", amount: 300, n: 1 },
    ],
    trades: 0,
    margin: null,
    ...p,
  });

  it("приход ≥ 5000, награды+подарки ≥ 95 %, траты < 5 %", () => {
    const rows = findRewardHeavy([delta({})]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "reward_heavy", score: 10_000 });
    expect(rows[0].details).toMatchObject({
      currency: "gold",
      earned: 10_000,
      rewardShare: 1,
      spent: 100,
    });
  });

  it("мало прихода, или много торговли, или тратит — не подходит", () => {
    expect(findRewardHeavy([delta({ earned: 4_000 })])).toEqual([]);
    expect(
      findRewardHeavy([
        delta({ byKind: [{ kind: "market_sell", group: "trade_sell", amount: 10_000, n: 1 }] }),
      ]),
    ).toEqual([]);
    expect(findRewardHeavy([delta({ spent: 600 })])).toEqual([]);
  });
});
