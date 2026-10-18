// Турнир рыбаков, слово владельца 14.10.2026 — на вопрос «засчитывать ли рыбу,
// купленную до старта и проданную в турнире дороже»: «да, засчитывай все».
// Своё — когда бы ни пришло (поймано, выращено, куплено, сварено до старта и
// до записи); очко — только событие после оплаченной записи и не раньше
// старта; своё засчитываемое списывается первым. Чужое, бокс, обмен — нет.
import { describe, expect, it } from "vitest";
import type { FlowRow } from "@/lib/tournament/flowAct";
import {
  FISH_SALE_RULE,
  POTION_DRINK_RULE,
  pieceFlow,
  type PieceOpts,
} from "@/lib/tournament/pieceFlow";
import { linkedPieces } from "@/lib/tournament/pieceLink";

let n = 0;
const row = (o: Partial<FlowRow> & Pick<FlowRow, "side" | "qty">): FlowRow => ({
  id: `r${String(++n).padStart(5, "0")}`,
  at: n,
  account: "A",
  source: "town",
  total: 0,
  cur: "gold",
  place: "m:1,2",
  ...o,
});
/** Купил qty по unit за штуку (ратуша, золото). */
const buy = (qty: number, unit: number, o: Partial<FlowRow> = {}) =>
  row({ side: "buy", qty, total: qty * unit, place: null, ...o });
/** Продал qty по unit за штуку (ратуша, золото). */
const sell = (qty: number, unit: number, o: Partial<FlowRow> = {}) =>
  row({ side: "sell", qty, total: qty * unit, place: null, ...o });
const caught = (qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "take", source: "fish", qty, ...o });
const grown = (qty: number) =>
  row({ side: "take", source: "field", qty, ref: `fw:5,6:k${n + 1}:own` });
const drink = (qty: number, o: Partial<FlowRow> = {}) =>
  row({ side: "use", source: "drink", qty, place: null, cur: "", ...o });
const shelf = (side: "put" | "take", qty: number, o: Partial<FlowRow> = {}) =>
  row({ side, source: side === "put" ? "wh_put" : "wh_take", qty, place: "m:5,5", ...o });

const sum = (rows: FlowRow[], o: Partial<PieceOpts>, acc = "A") =>
  pieceFlow(rows, { start: 0, since: 0, till: 1e9, rule: FISH_SALE_RULE, ...o })
    .filter((p) => p.account === acc)
    .reduce((s, p) => s + p.qty, 0);

describe("продажа рыбы — своё, когда бы ни пришло", () => {
  it("купил до старта — продал в турнире дороже: засчитано", () => {
    const rows = [buy(10, 30), sell(10, 40)];
    expect(sum(rows, { start: rows[1].at })).toBe(10);
    // И до записи: записался между покупкой и продажей.
    expect(sum(rows, { joined: new Map([["A", rows[1].at]]) })).toBe(10);
  });

  it("поймал или вырастил до старта — продал в турнире: засчитано", () => {
    const rows = [caught(5), grown(3), sell(8, 1)];
    expect(sum(rows, { start: rows[2].at, joined: new Map([["A", rows[2].at]]) })).toBe(8);
  });

  it("продал до записи или до старта — не засчитано, штуки ушли", () => {
    const rows = [caught(5), sell(3, 1), sell(2, 1)];
    expect(sum(rows, { joined: new Map([["A", rows[2].at]]) })).toBe(2);
    expect(sum(rows, { start: rows[2].at })).toBe(2);
    // Не записан — ничего.
    expect(sum(rows, { joined: new Map() })).toBe(0);
  });

  it("купленное, проданное дороже до записи, «дороже» не копит", () => {
    // 5 по 10; до записи 2 по 20 (минус 10), после — 3 по 20: плюс 50.
    const rows = [buy(5, 10), sell(2, 20), sell(3, 20)];
    expect(sum(rows, { joined: new Map([["A", rows[2].at]]) })).toBe(3);
  });

  it("чужое — нет, хоть и до старта: твин купил или поймал и отдал через полку", () => {
    const b = { account: "B" };
    const viaShelf = [buy(4, 10, b), caught(3, b), shelf("put", 7, b), shelf("take", 7)];
    const rows = [...viaShelf, sell(7, 50)];
    expect(sum(rows, { start: rows[4].at })).toBe(0);
  });

  it("бокс и обмен — нет и до старта", () => {
    const rows = [buy(2, 0, { source: "mystic", cur: "box" }), buy(1, 1, { cur: "stone" })];
    const sale = sell(3, 50);
    expect(sum([...rows, sale], { start: sale.at })).toBe(0);
  });

  it("жалоба 14.10: старая рыба с грядки + 9 пойманных, продал 9 — все 9", () => {
    const rows = [grown(4), grown(6), caught(9), sell(9, 1)];
    const o = { start: rows[2].at, joined: new Map([["A", 0]]) };
    expect(sum(rows, o)).toBe(9);
  });

  it("как у player06: круг до старта, ещё 99 по 68 — продал 94 по 83,4 в турнире", () => {
    const rows = [buy(200, 63), sell(200, 84), buy(99, 68.18), sell(94, 83.4)];
    expect(sum(rows, { start: rows[3].at })).toBe(94);
    // В минусе по купленному — ждёт: те же 94 по 60 очков не дают.
    const loss = [buy(200, 63), sell(200, 60), buy(99, 68.18), sell(94, 70)];
    expect(sum(loss, { start: loss[3].at })).toBe(0);
  });

  it("продажа берёт своё засчитываемое первым, а не дешёвую покупку", () => {
    const rows = [buy(10, 30), caught(3), sell(3, 20)];
    expect(sum(rows, {})).toBe(3);
  });
});

describe("плюс по купленному — с записи, купленное раньше — по своей цене", () => {
  const pay = (qty: number) => row({ side: "pay", source: "market", qty, ref: `mkt:p${n}:pay0:0` });

  it("купленное до старта и отданное за зелья не держит в минусе", () => {
    // Как у acc_-VomN…: до старта купил 100 и отдал за зелья, в турнире —
    // честная перепродажа между ратушами 0,67 → 1,20.
    const rows = [buy(100, 0.6), pay(100), buy(120, 0.67), sell(99, 1.2)];
    expect(sum(rows, { start: rows[2].at })).toBe(99);
  });

  it("прибыль до старта не даёт запаса на круги в минусе в турнире", () => {
    // До старта: 50 по 0,6, продал 10 по 20. В турнире: купил 40 по 1,20 и
    // сдал 40 по 1,00 — в минусе по купленному: очков нет.
    const rows = [buy(50, 0.6), sell(10, 20), buy(40, 1.2), sell(40, 1)];
    expect(sum(rows, { start: rows[2].at })).toBe(0);
    // Без круга запас до старта, проданный дороже своей цены, — засчитан.
    const plain = [buy(50, 0.6), sell(10, 20), sell(40, 1)];
    expect(sum(plain, { start: plain[2].at })).toBe(40);
  });

  it("прибыль с запаса в турнире кругам не помогает: очков — не больше дешёвых штук", () => {
    // Ревью 14.10: 50 по 0,6 до старта; в турнире 25 по 2,0, потом круги
    // «купил 40 по 1,20 → сдал по 1,00». По средней цене выходило 65 и больше.
    const circle = () => [buy(40, 1.2), sell(40, 1)];
    const rows = [buy(50, 0.6), sell(25, 2), ...circle()];
    expect(sum(rows, { start: rows[1].at })).toBe(50);
    expect(sum([...rows, ...circle(), ...circle()], { start: rows[1].at })).toBe(50);
    // Запас 1500 по 0,15: продал 500 по 1,0 и 13 кругов по 99 — не больше 1500.
    const big = [buy(1500, 0.15), sell(500, 1)];
    for (let i = 0; i < 13; i++) big.push(buy(99, 1.2), sell(99, 1));
    expect(sum(big, { start: big[1].at })).toBe(1500);
  });

  it("купленное дешевле цены продажи уходит раньше пойманного: перепродажа не теряется", () => {
    // До старта: 60 купил, 94 поймал. В турнире: 120 по 0,67 → 99 и 21 по 1,20,
    // остальное — за зелья. Своим уловом вперёд «съели» бы перепродажу.
    const rows = [buy(60, 0.7), caught(94), buy(120, 0.67), sell(99, 1.2), sell(21, 1.2)];
    expect(sum([...rows, pay(154)], { start: rows[2].at })).toBe(120);
    // Куплено дороже цены продажи — первым своё засчитываемое (жалоба 14.10).
    expect(sum([buy(10, 2), caught(4), sell(4, 1)], {})).toBe(4);
    // Куплено дешевле — первым только столько штук, сколько их куплено дешевле.
    // 4 по 0,5 и 2 по 2; продал 6 по 1,6 — 4 купленных и 2 пойманных, в плюсе.
    expect(sum([buy(4, 0.5), buy(2, 2), caught(4), sell(6, 1.6)], {})).toBe(6);
  });

  it("варка и еда берут улов последним (ревью 14.10): купленное уходит первым", () => {
    const eat = (qty: number) => row({ side: "use", source: "drink", qty, place: null, cur: "" });
    expect(sum([caught(5), buy(5, 3), pay(5), sell(5, 1)], {})).toBe(5);
    expect(sum([caught(5), buy(5, 3), eat(5), sell(5, 1)], {})).toBe(5);
  });
});

describe("зелья скорости — своё, когда бы ни пришло", () => {
  const potions = (rows: FlowRow[], o: Partial<PieceOpts>) =>
    pieceFlow(rows, { start: 0, since: 0, till: 1e9, rule: POTION_DRINK_RULE, ...o })
      .filter((p) => p.account === "A")
      .reduce((s, p) => s + p.qty, 0);

  it("купленное до старта и до записи — выпито в турнире: засчитано", () => {
    const rows = [buy(3, 1, { source: "market" }), drink(3)];
    expect(potions(rows, { start: rows[1].at, joined: new Map([["A", rows[1].at]]) })).toBe(3);
  });

  it("выпито до записи — нет; чужое с полки — нет", () => {
    const early = [buy(4, 1), drink(3), drink(1)];
    expect(potions(early, { joined: new Map([["A", early[2].at]]) })).toBe(1);
    const b = { account: "B" };
    expect(potions([buy(2, 1, b), shelf("put", 2, b), shelf("take", 2), drink(2)], {})).toBe(0);
  });

  const R = "mkt:mkt_d:A:k1";
  const brew = (fish: FlowRow[]) => {
    const pay = row({ side: "pay", source: "market", qty: 2, ref: `${R}:pay0:0` });
    const potion = [buy(1, 0, { source: "market", ref: R }), drink(1)];
    const o = { start: potion[1].at, since: 0, till: 1e9, rule: POTION_DRINK_RULE };
    return linkedPieces([potion], [[...fish, pay], potion], o).reduce((s, p) => s + p.qty, 0);
  };

  it("сварено до старта самим — своё, и из рыбы твина тоже (владелец, 14.10.2026)", () => {
    expect(brew([caught(2)])).toBe(1);
    const b = { account: "B" };
    expect(brew([caught(2, b), shelf("put", 2, b), shelf("take", 2)])).toBe(1);
  });

  it("плата берёт своё первым: своя и твинова рыба на руках — зелье своё", () => {
    const b = { account: "B" };
    expect(brew([caught(2, b), shelf("put", 2, b), shelf("take", 2), caught(2)])).toBe(1);
  });
});
