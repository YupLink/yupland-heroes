// «Золото» = прибыль с продаж за золото; происхождение не сбрасывается в
// хранилищах (владелец, 03–04.10.2026); положенное другим аккаунтом — без
// прибыли (06.10.2026, переходы между аккаунтами — goldTransfer.test.ts).
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
  place: null,
  ...o,
});
const buy = (qty: number, total: number, o: Partial<FlowRow> = {}) =>
  row({ side: "buy", qty, total, ...o });
const sell = (qty: number, total: number, o: Partial<FlowRow> = {}) =>
  row({ side: "sell", source: "market_sell", qty, total, ...o });
const sum = (rows: FlowRow[], acc?: string) =>
  goldProfitFlow(rows, 0, 1e9)
    .filter((p) => !acc || p.account === acc)
    .reduce((s, p) => s + p.profit, 0);

describe("золото — прибыль с продаж", () => {
  it("купил за 100, продал за 150 — 50; продал за 80 — ноль; добытое — вся выручка", () => {
    expect(sum([buy(10, 100), sell(10, 150)])).toBe(50);
    expect(sum([buy(10, 100), sell(10, 80)])).toBe(0);
    expect(sum([sell(5, 50)])).toBe(50);
  });

  it("купил в маркете → продал ратуше: прибыль — разница, не выручка", () => {
    expect(sum([buy(100, 3000), sell(100, 3300, { source: "town" })])).toBe(300);
  });

  it("купленное уходит первым по средней цене", () => {
    expect(sum([buy(5, 50), sell(10, 200)])).toBe(150);
    expect(sum([buy(10, 100), buy(10, 200), sell(10, 200)])).toBe(50);
  });

  it("купленное не за золото — выручка целиком: вычитать из золота нечего", () => {
    // Владелец, 08.10.2026: «из мистик бокса тоже можно продавать и получать
    // прибыль — это же подарок = 100 % прибыли». Камень, билеты, DARAI — то же.
    expect(sum([buy(10, 500, { cur: "stone" }), sell(10, 300)])).toBe(300);
  });

  it("накопленное до турнира прибыли не даёт — считаем только нажитое в нём", () => {
    // Владелец, 08.10.2026: «только то, что было накоплено после начала
    // турнира». Купил до старта — продажа внутри идёт как распродажа запасов.
    const rows = [buy(10, 100), sell(4, 60), sell(6, 90)];
    expect(goldProfitFlow(rows, rows[2].at, 1e9)).toEqual([]);
    // Та же покупка внутри турнира — прибыль сверх своей цены.
    expect(goldProfitFlow(rows, 0, 1e9).reduce((n, p) => n + p.profit, 0)).toBe(50);
  });

  it("урожай в личные ячейки склада — добытое; выращенное до старта — запасы", () => {
    const rows = [row({ side: "take", source: "field", qty: 4, place: "m:1,2" }), sell(4, 40)];
    expect(sum(rows)).toBe(40);
    expect(goldProfitFlow(rows, rows[1].at, 1e9)).toEqual([]);
  });
});

describe("происхождение не сбрасывается в хранилищах", () => {
  const shelf = { place: "map:1,2" };

  it("купил, положил в сундук, сам забрал и продал — цена покупки вычтена", () => {
    const rows = [
      buy(10, 250),
      row({ side: "put", source: "plain_chest", qty: 10, ...shelf }),
      row({ side: "take", source: "plain_chest", qty: 10, ...shelf }),
      sell(10, 300),
    ];
    expect(sum(rows)).toBe(50);
  });

  it("купил, положил на общий склад, сам забрал и продал — прибыль сверх своей цены", () => {
    const rows = [
      buy(100, 2500),
      row({ side: "put", source: "wh_put", qty: 100, ...shelf }),
      row({ side: "take", source: "wh_take", qty: 100, ...shelf }),
      sell(100, 3000),
    ];
    expect(sum(rows)).toBe(500);
  });

  it("свой урожай с общей полки и своё из мешочка — добытое", () => {
    const harvest = [
      row({ side: "put", source: "field", qty: 10, ...shelf }),
      row({ side: "take", source: "wh_take", qty: 10, ...shelf }),
      sell(10, 100),
    ];
    expect(sum(harvest)).toBe(100);
    const bag = [
      row({ side: "put", source: "loot_bag", qty: 10, ...shelf }),
      row({ side: "take", source: "loot_bag", qty: 10, ...shelf }),
      sell(10, 100),
    ];
    expect(sum(bag)).toBe(100);
  });

  it("на полке своё купленное и урожай: каждый забирает своё — купленное с ценой", () => {
    const rows = [
      row({ side: "put", source: "field", account: "B", qty: 10, ...shelf }),
      buy(10, 100),
      row({ side: "put", source: "wh_put", qty: 10, ...shelf }),
      row({ side: "take", source: "wh_take", qty: 10, ...shelf }),
      sell(10, 150),
      row({ side: "take", source: "wh_take", account: "B", qty: 10, ...shelf }),
      sell(10, 100, { account: "B" }),
    ];
    expect(sum(rows, "A")).toBe(50);
    expect(sum(rows, "B")).toBe(100);
  });

  it("плата товаром за ворота тратит купленное первым", () => {
    const rows = [buy(10, 100), row({ side: "pay", source: "gate", qty: 10 }), sell(10, 100)];
    expect(sum(rows)).toBe(100);
  });
});

describe("окно подтяжки, улов и выпитое (12.10.2026)", () => {
  it("купленное в турнире раньше окна подтяжки — не запасы: прибыль сверх цены", () => {
    const rows = [buy(10, 100), sell(10, 150)];
    // Окно началось после покупки, турнир — раньше неё.
    const pts = goldProfitFlow(rows, rows[1].at, 1e9, {}, 0);
    expect(pts.map((p) => p.profit)).toEqual([50]);
  });

  it("улов до старта — запасы, после — добытое", () => {
    const fish = (qty: number) => row({ side: "take", source: "fish", qty, cur: "" });
    const rows = [fish(5), sell(5, 50), fish(3), sell(3, 30)];
    const pts = goldProfitFlow(rows, 0, 1e9, {}, rows[2].at);
    expect(pts.map((p) => p.profit)).toEqual([30]);
  });

  it("выпитое уходит со счёта: купленное первым", () => {
    const rows = [buy(10, 100), row({ side: "use", source: "drink", qty: 10 }), sell(10, 100)];
    expect(sum(rows)).toBe(100);
  });
});

describe("чужой мешочек не стирает цену (ревью 12.10.2026)", () => {
  it("купил за золото → положил в чужой мешочек → забрал → продал: прибыль = выручка − цена", () => {
    const rows = [
      buy(10, 100),
      row({ side: "put", source: "loot_bag", qty: 10, place: "m:1,2" }),
      row({ side: "take", source: "loot_bag", qty: 10, place: "m:1,2", counterparty: "B" }),
      sell(10, 110),
    ];
    expect(sum(rows)).toBe(10);
  });
});
