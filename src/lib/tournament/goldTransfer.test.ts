// «Золото»: переходы между аккаунтами и хранилищами (владелец, 08.10.2026:
// «давай дорогу и тем, кто пробует перекидывать между складами и акками — но
// только то, что было накоплено после начала турнира»).
//
// Что это значит: забранное из любого хранилища — твоё, и продажа его даёт
// прибыль целиком. Исключений два: своё купленное за золото сохраняет свою
// цену (круг «купил дорого → положил → забрал» не отмывает убыток) и всё, что
// пришло ДО старта турнира, прибыли не даёт вовсе.
import { describe, expect, it } from "vitest";
import { goldProfitFlow, type FlowRow } from "@/lib/tournament/goldProfit";

let n = 0;
const row = (o: Partial<FlowRow> & Pick<FlowRow, "side" | "qty">): FlowRow => ({
  id: `r${String(++n).padStart(4, "0")}`,
  at: n,
  account: "A",
  source: "market",
  total: 0,
  cur: "gold",
  place: "m:1,2",
  ...o,
});
const buy = (qty: number, total: number, o: Partial<FlowRow> = {}) =>
  row({ side: "buy", qty, total, place: null, ...o });
const sell = (qty: number, total: number, o: Partial<FlowRow> = {}) =>
  row({ side: "sell", source: "market_sell", qty, total, place: null, ...o });
const put = (source: string, qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "put", source, qty, ...o });
const take = (source: string, qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "take", source, qty, ...o });
const sum = (rows: FlowRow[], acc: string, since = 0) =>
  goldProfitFlow(rows, since, 1e9)
    .filter((p) => p.account === acc)
    .reduce((s, p) => s + p.profit, 0);

describe("забранное из хранилища — своё", () => {
  it("общая полка: добытое A, забрал B — у B прибыль; цепочка A → B → C тоже", () => {
    const rows = [
      put("wh_put", 10),
      take("wh_take", 10, { account: "B" }),
      sell(4, 40, { account: "B" }),
      put("wh_put", 6, { account: "B", place: "m:5,5" }),
      take("wh_take", 6, { account: "C", place: "m:5,5" }),
      sell(6, 60, { account: "C" }),
    ];
    expect(sum(rows, "B")).toBe(40);
    expect(sum(rows, "C")).toBe(60);
  });

  it("купленное A за золото, забрал B — у B выручка целиком: он за него не платил", () => {
    const rows = [buy(10, 100), put("plain_chest", 10), take("plain_chest", 10, { account: "B" })];
    expect(sum([...rows, sell(10, 300, { account: "B" })], "B")).toBe(300);
  });

  it("обычный сундук и мешочек: положил A, забрал B — у B прибыль", () => {
    const chest = [put("plain_chest", 10), take("plain_chest", 10, { account: "B" })];
    expect(sum([...chest, sell(10, 100, { account: "B" })], "B")).toBe(100);
    const bag = [put("loot_bag", 10), take("loot_bag", 10, { account: "B" })];
    expect(sum([...bag, sell(10, 100, { account: "B" })], "B")).toBe(100);
  });

  it("мешочек без строки «положил»: и забравший, и хозяин — каждый своё", () => {
    const rows = [
      take("loot_bag", 5, { account: "B", counterparty: "A" }),
      sell(5, 50, { account: "B" }),
      take("loot_bag", 5),
      sell(5, 50),
    ];
    expect(sum(rows, "B")).toBe(50);
    expect(sum(rows, "A")).toBe(50);
  });

  it("грядка: урожай на общей полке — забрал кто угодно, прибыль у него", () => {
    const rows = [
      put("field", 20),
      take("wh_take", 10, { account: "B" }),
      sell(10, 100, { account: "B" }),
      take("wh_take", 10),
      sell(10, 100),
    ];
    expect(sum(rows, "B")).toBe(100);
    expect(sum(rows, "A")).toBe(100);
  });

  it("своё купленное через сундук и назад — цена своя, убыток не отмывается", () => {
    // Купил за 100, продал за 80 — это минус, а не прибыль, сколько ни катай
    // товар через хранилища (владелец: «торговля в минус — хреновая затея»).
    const rows = [buy(5, 100), put("plain_chest", 5), take("plain_chest", 5), sell(5, 80)];
    expect(sum(rows, "A")).toBe(0);
    // А сверх своей цены — прибыль как обычно.
    const win = [buy(5, 100), put("plain_chest", 5), take("plain_chest", 5), sell(5, 180)];
    expect(sum(win, "A")).toBe(80);
  });

  it("накопленное до старта турнира прибыли не даёт", () => {
    const rows = [
      put("wh_put", 10),
      take("wh_take", 10, { account: "B" }),
      sell(10, 100, { account: "B" }),
    ];
    // Старт турнира — после всех вложений: продажа идёт как распродажа запасов.
    expect(sum(rows, "B", rows[2].at)).toBe(0);
  });
});

describe("магический сундук", () => {
  const net = { place: "m:9,9" };

  it("своё в свою сеть и назад — своё; купленное в рюкзаке не трогается", () => {
    const rows = [
      buy(10, 100, { place: null }),
      put("chest", 10, net),
      take("chest", 10, net),
      sell(20, 300),
    ];
    expect(sum(rows, "A")).toBe(200);
  });

  it("чужой унёс из моей сети — у него прибыль: вынес, значит его", () => {
    const rows = [
      put("chest", 10, { ...net, counterparty: "A" }),
      take("chest_plunder", 10, { account: "B", ...net, counterparty: "A" }),
      sell(10, 100, { account: "B" }),
    ];
    expect(sum(rows, "B")).toBe(100);
  });
});
