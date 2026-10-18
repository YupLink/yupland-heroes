// Турнир рыбаков (владелец, 12.10.2026): «Продажа рыбы» — своя пойманная и
// выращенная на своей грядке рыба, купленная — только проданная дороже («но
// только в +»); «Зелья скорости» — только выпитое своё. Перекидывание через
// другие аккаунты очков не даёт (полка, сундук, мешочек, чужая грядка).
// Своё — когда бы ни пришло (14.10.2026: «да, засчитывай все») — fishAllOwn.test.ts.
import { describe, expect, it } from "vitest";
import type { FlowRow } from "@/lib/tournament/flowAct";
import { FISH_SALE_RULE, POTION_DRINK_RULE, pieceFlow } from "@/lib/tournament/pieceFlow";

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
const caughtToBag = (qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "put", source: "fish", qty, ...o });
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

const fish = (rows: FlowRow[], acc = "A", start = 0, since = 0) =>
  pieceFlow(rows, { start, since, till: 1e9, rule: FISH_SALE_RULE })
    .filter((p) => p.account === acc)
    .reduce((s, p) => s + p.qty, 0);
const potions = (rows: FlowRow[], acc = "A") =>
  pieceFlow(rows, { start: 0, since: 0, till: 1e9, rule: POTION_DRINK_RULE })
    .filter((p) => p.account === acc)
    .reduce((s, p) => s + p.qty, 0);

describe("продажа рыбы — только свой улов", () => {
  it("поймал и продал — очко за каждую штуку; продажа маркету — так же", () => {
    expect(fish([caught(5), sell(5)])).toBe(5);
    expect(fish([caught(3), sell(3, { source: "market_sell", cur: "stone" })])).toBe(3);
  });

  it("купленная и проданная дешевле — очков нет; приз бокса — нет", () => {
    expect(fish([buy(10), sell(10)])).toBe(0);
    expect(fish([buy(4, { source: "mystic", cur: "box", total: 0 }), sell(4)])).toBe(0);
  });

  it("купил и поймал — очков не больше, чем поймано; пойманное уходит первым", () => {
    const rows = [caught(3), buy(5), sell(4), sell(4)];
    const pts = pieceFlow(rows, { start: 0, since: 0, till: 1e9, rule: FISH_SALE_RULE });
    expect(pts.map((p) => p.qty)).toEqual([3]);
    expect(pts[0].id).toBe(rows[2].id);
  });

  it("рыба от другого аккаунта — склад, сундук, мешочек — очков не даёт", () => {
    const shelf = [
      caught(5, { account: "B" }),
      put("wh_put", 5, { account: "B" }),
      take("wh_take", 5),
    ];
    expect(fish([...shelf, sell(5)])).toBe(0);
    const chest = [
      caught(4, { account: "B" }),
      put("plain_chest", 4, { account: "B" }),
      take("plain_chest", 4),
    ];
    expect(fish([...chest, sell(4)])).toBe(0);
    const bag = [caughtToBag(2, { account: "B" }), take("loot_bag", 2, { counterparty: "B" })];
    expect(fish([...bag, sell(2)])).toBe(0);
  });

  it("чужая рыба вернулась к хозяину — снова его", () => {
    const rows = [
      caught(5, { account: "B" }),
      put("wh_put", 5, { account: "B" }),
      take("wh_take", 5),
      put("wh_put", 5, { place: "m:3,3" }),
      take("wh_take", 5, { account: "B", place: "m:3,3" }),
      sell(5, { account: "B" }),
    ];
    expect(fish(rows, "B")).toBe(5);
    expect(fish(rows, "A")).toBe(0);
  });

  it("свой улов через склад и мешочек — свой", () => {
    expect(fish([caught(5), put("wh_put", 5), take("wh_take", 5), sell(5)])).toBe(5);
    // Не влезло в рюкзак — мешочком у рыбака, поднял сам.
    expect(fish([caughtToBag(3), take("loot_bag", 3), sell(3)])).toBe(3);
  });

  it("пойманное до старта — своё; продажа до старта лишь списывает его", () => {
    const rows = [caught(5), sell(2), caught(3), sell(6)];
    expect(fish(rows, "A", rows[2].at)).toBe(6);
  });

  it("продажа до окна подтяжки не считается, но улов списывает", () => {
    const rows = [caught(5), sell(2), sell(3)];
    const pts = pieceFlow(rows, { start: 0, since: rows[2].at, till: 1e9, rule: FISH_SALE_RULE });
    expect(pts.map((p) => [p.id, p.qty])).toEqual([[rows[2].id, 3]]);
  });

  it("отдал рыбу за зелье или съел — не продажа, и продать её уже нельзя", () => {
    const got = caught(4);
    const pay = row({ side: "pay", source: "market", qty: 2, ref: "mkt:x:pay0:0" });
    expect(fish([got, pay, drink(1), sell(4)])).toBe(1);
  });

  it("повтор подтяжки — те же очки с теми же строками", () => {
    const rows = [caught(5), sell(2), sell(3)];
    const opts = { start: 0, since: 0, till: 1e9, rule: FISH_SALE_RULE };
    expect(pieceFlow(rows, opts)).toEqual(pieceFlow([...rows].reverse(), opts));
  });
});

describe("зелья скорости — выпитое своё", () => {
  it("купленное и сваренное в маркете — своё", () => {
    expect(potions([buy(5, { source: "market", cur: "custom:cst_fish" }), drink(5)])).toBe(5);
    expect(potions([buy(2, { source: "mystic", cur: "box" }), drink(2)])).toBe(2);
  });

  it("зелье от другого аккаунта — полка, сундук, мешочек, грабёж — не засчитывается", () => {
    const shelf = [
      buy(3, { account: "B" }),
      put("wh_put", 3, { account: "B" }),
      take("wh_take", 3),
    ];
    expect(potions([...shelf, drink(3)])).toBe(0);
    const bag = [buy(2, { account: "B" }), put("loot_bag", 2, { account: "B" })];
    expect(potions([...bag, take("loot_bag", 2, { counterparty: "B" }), drink(2)])).toBe(0);
    const net = { place: "m:9,9" };
    const plunder = [
      buy(4, { account: "B" }),
      put("chest", 4, { account: "B", ...net }),
      take("chest_plunder", 4, { counterparty: "B", ...net }),
    ];
    expect(potions([...plunder, drink(4)])).toBe(0);
  });

  it("своё и чужое вперемешку — очков столько, сколько своего", () => {
    const rows = [
      buy(2),
      buy(3, { account: "B" }),
      put("wh_put", 3, { account: "B" }),
      take("wh_take", 3),
      drink(1),
      drink(4),
    ];
    expect(potions(rows)).toBe(2);
  });

  it("своё через полку и назад — своё; лежавшее до журнала в рюкзаке — своё", () => {
    expect(potions([buy(3), put("wh_put", 3), take("wh_take", 3), drink(3)])).toBe(3);
    expect(potions([drink(2)])).toBe(2);
  });
});
