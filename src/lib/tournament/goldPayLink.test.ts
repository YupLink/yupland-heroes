// «Золото»: плата товаром за покупку — цена своего купленного за золото едет в
// цену купленного (ревью 06.10: «Хлеб» за золото + «Пшеницу»).
import { describe, expect, it } from "vitest";
import type { FlowRow } from "@/lib/tournament/goldProfit";
import { buyRefOfPay, linkedGoldProfit } from "@/lib/tournament/goldPayLink";

let n = 0;
const row = (o: Partial<FlowRow> & Pick<FlowRow, "side" | "qty">): FlowRow => ({
  id: `p${String(++n).padStart(4, "0")}`,
  at: n,
  account: "A",
  source: "market",
  total: 0,
  cur: "gold",
  place: null,
  ...o,
});
const total = (lists: FlowRow[][], acc = "A") =>
  linkedGoldProfit(lists, 0, 1e9)
    .filter((p) => p.account === acc)
    .reduce((s, p) => s + p.profit, 0);

describe("плата товаром за покупку", () => {
  it("ref платы → ref покупки; прочие ref — нет", () => {
    expect(buyRefOfPay("mkt:x:acc:n1:pay1:0")).toBe("mkt:x:acc:n1");
    expect(buyRefOfPay("gate:m:1,2:abc")).toBeNull();
  });

  it("хлеб за 6 золота + 3 пшеницы по 0,5: прибыль 10 − 6 − 1,5", () => {
    const wheat = [
      row({ side: "buy", qty: 3, total: 1.5 }),
      row({ side: "pay", qty: 3, ref: "mkt:b:A:n1:pay1:0" }),
    ];
    const bread = [
      row({ side: "buy", qty: 1, total: 6, ref: "mkt:b:A:n1" }),
      row({ side: "sell", source: "market_sell", qty: 1, total: 10 }),
    ];
    expect(total([wheat, bread])).toBeCloseTo(2.5, 6);
  });

  it("своя добытая пшеница — цены нет, прибыль 10 − 6", () => {
    const wheat = [row({ side: "pay", qty: 3, ref: "mkt:b:A:n2:pay1:0" })];
    const bread = [
      row({ side: "buy", qty: 1, total: 6, ref: "mkt:b:A:n2" }),
      row({ side: "sell", source: "market_sell", qty: 1, total: 10 }),
    ];
    expect(total([wheat, bread])).toBeCloseTo(4, 6);
  });

  it("цепочка: зерно → пшеница → хлеб сходится", () => {
    const grain = [
      row({ side: "buy", qty: 2, total: 2 }),
      row({ side: "pay", qty: 2, ref: "mkt:w:A:n3:pay1:0" }),
    ];
    const wheat = [
      row({ side: "buy", qty: 3, total: 1, ref: "mkt:w:A:n3" }),
      row({ side: "pay", qty: 3, ref: "mkt:b:A:n4:pay1:0" }),
    ];
    const bread = [
      row({ side: "buy", qty: 1, total: 6, ref: "mkt:b:A:n4" }),
      row({ side: "sell", source: "market_sell", qty: 1, total: 10 }),
    ];
    // 10 − 6 − (1 + 2) = 1.
    expect(total([grain, wheat, bread])).toBeCloseTo(1, 6);
  });

  it("без платы товаром — как раньше, один проход", () => {
    const bread = [
      row({ side: "buy", qty: 1, total: 6, ref: "mkt:b:A:n5" }),
      row({ side: "sell", source: "market_sell", qty: 1, total: 10 }),
    ];
    expect(total([bread])).toBeCloseTo(4, 6);
  });
});
