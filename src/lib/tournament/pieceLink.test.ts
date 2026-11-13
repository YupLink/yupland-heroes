// Турнир рыбаков — дыры из ревью 12.10.2026 (pieceFlow, pieceLink): круг
// «положил своё в чужой мешочек → забрал → отдал основе». Своё — когда бы ни
// пришло (14.10.2026), очко — событие после записи; сваренное самим — своё,
// из чего бы ни сварено (владелец, 14.10.2026).
import { describe, expect, it } from "vitest";
import type { FlowRow } from "@/lib/tournament/flowAct";
import {
  FISH_SALE_RULE,
  POTION_DRINK_RULE,
  pieceFlow,
  type PieceOpts,
} from "@/lib/tournament/pieceFlow";
import { linkedPieces, swapRefs } from "@/lib/tournament/pieceLink";

let n = 0;
const row = (o: Partial<FlowRow> & Pick<FlowRow, "side" | "qty">): FlowRow => ({
  id: `r${String(++n).padStart(4, "0")}`,
  at: n,
  account: "A",
  source: "town",
  total: 0,
  cur: "gold",
  place: "m:1,2",
  ...o,
});
const caught = (qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "take", source: "fish", qty, ...o });
const buy = (qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "buy", qty, total: qty * 10, place: null, ...o });
const sell = (qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "sell", qty, total: qty * 5, place: null, ...o });
const drink = (qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "use", source: "drink", qty, place: null, cur: "", ...o });
const put = (source: string, qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "put", source, qty, ...o });
const take = (source: string, qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "take", source, qty, ...o });

const fish = (rows: FlowRow[], acc = "A") =>
  pieceFlow(rows, { start: 0, since: 0, till: 1e9, rule: FISH_SALE_RULE })
    .filter((p) => p.account === acc)
    .reduce((s, p) => s + p.qty, 0);
const potions = (rows: FlowRow[], acc = "A", o: Partial<PieceOpts> = {}) =>
  pieceFlow(rows, { start: 0, since: 0, till: 1e9, rule: POTION_DRINK_RULE, ...o })
    .filter((p) => p.account === acc)
    .reduce((s, p) => s + p.qty, 0);

describe("перекидывание через чужой мешочек (ревью 12.10.2026)", () => {
  // У основы A на клетке живой мешочек; твин B кладёт в него свои зелья и
  // забирает назад (строка «забрал» с контрагентом A — хозяином мешочка).
  const circle = () => [
    buy(10, { account: "B" }),
    put("loot_bag", 10, { account: "B" }),
    take("loot_bag", 10, { account: "B", counterparty: "A" }),
  ];

  it("забрал своё из чужого мешочка — своё, основе через полку очков не даёт", () => {
    const rows = [
      ...circle(),
      put("wh_put", 10, { account: "B", place: "m:5,5" }),
      take("wh_take", 10, { place: "m:5,5" }),
      drink(10),
    ];
    expect(potions(rows, "A")).toBe(0);
    // А сам твин своё выпить может: оно его.
    expect(potions([...circle(), drink(10, { account: "B" })], "B")).toBe(10);
  });

  it("сверх известного в чужом мешочке — ничьё, не хозяина мешочка", () => {
    const rows = [
      take("loot_bag", 3, { account: "B", counterparty: "A" }),
      put("wh_put", 3, { account: "B", place: "m:5,5" }),
      take("wh_take", 3, { place: "m:5,5" }),
      drink(3),
    ];
    expect(potions(rows, "A")).toBe(0);
    // Из своего мешочка — своё, как и раньше.
    expect(potions([take("loot_bag", 2), drink(2)], "A")).toBe(2);
  });

  it("рыба тем же кругом — тоже не своя основе", () => {
    const rows = [
      caught(5, { account: "B" }),
      put("loot_bag", 5, { account: "B" }),
      take("loot_bag", 5, { account: "B", counterparty: "A" }),
      put("wh_put", 5, { account: "B", place: "m:5,5" }),
      take("wh_take", 5, { place: "m:5,5" }),
      sell(5),
    ];
    expect(fish(rows, "A")).toBe(0);
  });
});

describe("своё — когда бы ни пришло, очко — после записи (14.10.2026)", () => {
  it("пойманное до записи и проданное после — засчитано целиком", () => {
    const rows = [caught(30), caught(2), sell(32)];
    const joined = new Map([["A", rows[1].at]]);
    const pts = pieceFlow(rows, { start: 0, since: 0, till: 1e9, rule: FISH_SALE_RULE, joined });
    expect(pts.map((p) => p.qty)).toEqual([32]);
  });

  it("зелья, купленные до записи (или до старта), — свои; выпитое до записи — нет", () => {
    const rows = [buy(5), buy(1), drink(6)];
    expect(potions(rows, "A", { joined: new Map([["A", rows[1].at]]) })).toBe(6);
    expect(potions(rows, "A", { start: rows[1].at })).toBe(6);
    // Не записан — выпитое не засчитывается.
    expect(potions(rows, "A", { joined: new Map() })).toBe(0);
    // Выпил до записи — не очко, и выпитое уже не выпить второй раз.
    const early = [buy(3), drink(2), drink(1)];
    expect(potions(early, "A", { joined: new Map([["A", early[2].at]]) })).toBe(1);
  });
});

describe("зелье, сваренное самим, — своё, из чьих бы рыбы и вёдер ни сварено (владелец, 14.10.2026)", () => {
  const R = "mkt:mkt_d:A:k1";
  const pay = (qty: number, k = 0, o: Partial<FlowRow> = {}) =>
    row({ side: "pay", source: "market", qty, ref: `${R}:pay${k}:0`, ...o });
  const fishRows = (twin: boolean) =>
    twin
      ? [
          caught(2, { account: "B" }),
          put("wh_put", 2, { account: "B" }),
          take("wh_take", 2),
          pay(2),
        ]
      : [caught(2), pay(2)];
  const potion = [buy(1, { source: "market", ref: R }), drink(1)];
  const o = { start: 0, since: 0, till: 1e9, rule: POTION_DRINK_RULE };
  const sum = (counted: FlowRow[][], all: FlowRow[][]) =>
    linkedPieces(counted, all, o).reduce((s, p) => s + p.qty, 0);

  it("из рыбы твина с полки — своё, как из своего улова", () => {
    expect(sum([potion], [fishRows(true), potion])).toBe(1);
    expect(sum([potion], [fishRows(false), potion])).toBe(1);
  });

  it("игрок: вёдра и рыба из мешочков другого аккаунта — всё сваренное своё", () => {
    // Рыбу и вёдра выронил в мешочки B; A забирает их, варит сам и пьёт.
    const bag = { place: "m:7,7" };
    const fish = [
      caught(3, { account: "B" }),
      put("loot_bag", 3, { account: "B", ...bag }),
      take("loot_bag", 3, { counterparty: "B", ...bag }),
      caught(1),
      pay(4, 0),
    ];
    const buckets = [
      buy(2, { account: "B", source: "market" }),
      put("loot_bag", 2, { account: "B", ...bag }),
      take("loot_bag", 2, { counterparty: "B", ...bag }),
      pay(2, 1),
    ];
    const two = [buy(2, { source: "market", ref: R }), drink(2)];
    expect(sum([two], [fish, buckets, two])).toBe(2);
  });

  it("чужое ЗЕЛЬЕ — по-прежнему не своё", () => {
    const twin = [
      buy(3, { account: "B", source: "market" }),
      put("loot_bag", 3, { account: "B" }),
      take("loot_bag", 3, { counterparty: "B" }),
      drink(3),
    ];
    expect(sum([twin], [twin])).toBe(0);
  });
});

describe("обмен — покупка с платой товаром (swapRefs)", () => {
  const R = "mkt:mkt_f:A:k1";
  it("ref покупки — по строкам «заплатил» до конца окна; грабёж и пустые — мимо", () => {
    const rows = [
      row({ side: "pay", source: "market", qty: 3, ref: `${R}:pay1:0` }),
      row({ side: "pay", source: "market", qty: 0, ref: "mkt:zero:pay0:0" }),
      row({ side: "pay", source: "chest_plunder", qty: 2, ref: "mkt:pl:pay0:0" }),
      row({ side: "pay", source: "market", qty: 1, ref: "mkt:late:pay0:0", at: 1e9 }),
      row({ side: "pay", source: "market", qty: 1, ref: "town:k9" }),
    ];
    expect([...swapRefs([rows], 1e9)]).toEqual([R]);
  });
});
