// «Продажа рыбы» — слово владельца 12.10.2026: «Купленную рыбу считаем, если
// что (но только в +)». Купленная самим — только купленная дешевле цены
// продажи в той же валюте и только в плюсе по купленному целиком (buyBook.ts);
// обмен и бокс — нет. Ревью 12.10 и 14.10.2026: круг через ратушу и выбор
// штуки полкой очков не дают.
// Грядка — fishGrow.test.ts.
import { describe, expect, it } from "vitest";
import type { FlowRow } from "@/lib/tournament/flowAct";
import { FISH_SALE_RULE, pieceFlow, type PieceOpts } from "@/lib/tournament/pieceFlow";
import { linkedPieces } from "@/lib/tournament/pieceLink";
import { quoteBuy, quoteSell, type TownCurve } from "@/lib/townPricing";

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
const caught = (qty: number) => row({ side: "take", source: "fish", qty });
const shelf = { place: "m:7,7" };

const fish = (rows: FlowRow[], acc = "A", o: Partial<PieceOpts> = {}) =>
  pieceFlow(rows, { start: 0, since: 0, till: 1e9, rule: FISH_SALE_RULE, ...o })
    .filter((p) => p.account === acc)
    .reduce((s, p) => s + p.qty, 0);

describe("купленная рыба — только в плюс", () => {
  it("купил по 30, продал по 33 — штука засчитана", () => {
    expect(fish([buy(1, 30), sell(1, 33)])).toBe(1);
  });

  it("купил по 30, продал по 30 или дешевле — нет", () => {
    expect(fish([buy(1, 30), sell(1, 30)])).toBe(0);
    expect(fish([buy(1, 30), sell(1, 29)])).toBe(0);
  });

  it("купил за DARAI, продал за золото — нет; за DARAI дороже — да", () => {
    const darai = { source: "market", cur: "Darai" };
    expect(fish([buy(1, 30, darai), sell(1, 33)])).toBe(0);
    expect(fish([buy(1, 30, darai), sell(1, 33, { source: "market_sell", cur: "Darai" })])).toBe(1);
  });

  it("цена — за штуку: купил 10 за 30, продал 10 за 40 — все 10", () => {
    expect(fish([buy(10, 3), sell(10, 4)])).toBe(10);
  });

  it("обмен — плата товаром — не засчитывается", () => {
    // Цена товаром: в строке «купил» — ключ товара.
    expect(fish([buy(1, 1, { source: "market", cur: "custom:cst_wheat" }), sell(1, 50)])).toBe(0);
    expect(fish([buy(1, 1, { source: "market", cur: "stone" }), sell(1, 50)])).toBe(0);
    // Золото + товар: товар уходит строкой «заплатил» к этой покупке.
    const R = "mkt:mkt_f:A:k1";
    const wheat = [row({ side: "pay", source: "market", qty: 3, ref: `${R}:pay1:0` })];
    const rows = [buy(1, 30, { source: "market", ref: R }), sell(1, 40)];
    const o = { start: 0, since: 0, till: 1e9, rule: FISH_SALE_RULE };
    expect(linkedPieces([rows], [wheat, rows], o)).toEqual([]);
    // Без платы товаром — та же покупка засчитана.
    expect(linkedPieces([rows], [rows], o).map((p) => p.qty)).toEqual([1]);
  });

  it("приз бокса — нет", () => {
    expect(fish([buy(2, 0, { source: "mystic", cur: "box" }), sell(2, 10)])).toBe(0);
  });

  it("купил другой аккаунт и отдал через полку — нет, хоть и дороже", () => {
    const rows = [
      buy(2, 10, { account: "B" }),
      row({ side: "put", source: "wh_put", qty: 2, account: "B" }),
      row({ side: "take", source: "wh_take", qty: 2 }),
      sell(2, 50),
    ];
    expect(fish(rows)).toBe(0);
  });

  it("купленное до записи — тоже в плюс (владелец, 14.10.2026: «засчитывай все»)", () => {
    const rows = [buy(1, 10), buy(1, 10), sell(2, 20)];
    expect(fish(rows, "A", { joined: new Map([["A", rows[1].at]]) })).toBe(2);
  });
});

describe("в плюсе — по купленному целиком", () => {
  it("дороже, но в минусе по всем покупкам — нет; вышел в плюс — засчитано на той продаже", () => {
    // 5 по 10 — 50 золота. Продал 1 по 20 (дороже средней), остальное придержал: минус 30.
    const rows = [buy(5, 10), sell(1, 20)];
    expect(fish(rows)).toBe(0);
    // Продал ещё 4 по 12: выручка 68 > 50 — плюс, засчитаны все 5 (все дороже 10).
    const more = [...rows, sell(4, 12)];
    const pts = pieceFlow(more, { start: 0, since: 0, till: 1e9, rule: FISH_SALE_RULE });
    expect(pts.map((p) => [p.id, p.qty])).toEqual([[more[2].id, 5]]);
  });

  it("штука — только купленная дешевле цены продажи, каждая покупка один раз", () => {
    // 30 и 40, продал по 45 и по 35: 40 → 45, 30 → 35 — обе дешевле своей продажи.
    expect(fish([buy(1, 30), buy(1, 40), sell(1, 45), sell(1, 35)])).toBe(2);
    expect(fish([buy(1, 30), buy(1, 40), sell(1, 35), sell(1, 45)])).toBe(2);
    // Обе по 36: дешевле 36 куплена одна (средняя 35 тут не в счёт, ревью 14.10).
    expect(fish([buy(1, 30), buy(1, 40), sell(2, 36)])).toBe(1);
  });

  it("полкой выгодную штуку не выбрать (ревью 12.10.2026)", () => {
    const put = () => row({ side: "put", source: "wh_put", qty: 1, ...shelf });
    const take = () => row({ side: "take", source: "wh_take", qty: 1, ...shelf });
    // Покупка по 30 лежит на полке, пока продаётся та, что по 40: счёт тот же.
    const bare = fish([buy(1, 30), buy(1, 40), sell(1, 36), sell(1, 36)]);
    expect(bare).toBe(1);
    expect(fish([buy(1, 30), buy(1, 40), put(), sell(1, 36), take(), sell(1, 36)])).toBe(bare);
    // Положил и сразу забрал — тоже ничего не меняет.
    expect(fish([buy(1, 30), buy(1, 40), put(), take(), sell(1, 36), sell(1, 36)])).toBe(bare);
  });

  it("своя покупка через полку и назад — цена при ней", () => {
    const rows = [
      buy(2, 30),
      row({ side: "put", source: "wh_put", qty: 2, ...shelf }),
      row({ side: "take", source: "wh_take", qty: 2, ...shelf }),
      sell(1, 31),
      sell(1, 30),
    ];
    expect(fish(rows)).toBe(1);
  });

  it("пойманное уходит раньше купленного (14.10.2026)", () => {
    const rows = [caught(1), buy(1, 30), sell(1, 20), sell(1, 20)];
    const pts = pieceFlow(rows, { start: 0, since: 0, till: 1e9, rule: FISH_SALE_RULE });
    expect(pts.map((p) => [p.id, p.qty])).toEqual([[rows[2].id, 1]]);
  });

  it("дешёвое купленное в сундуке не вытесняет улов из рюкзака (аудит 14.10, acc_1-AzQ…)", () => {
    const chest = { place: "m:88,13" };
    const rows = [
      caught(10),
      buy(1000, 0.5),
      row({ side: "put", source: "plain_chest", qty: 800, ...chest }),
      // Большую часть купленного на руках отдал за зелья.
      row({ side: "pay", source: "market", qty: 100, place: null }),
      // Продал 5 из рюкзака: на руках 100 купленных и 10 своих.
      sell(5, 0.6),
    ];
    // Плюс по купленному достижим только с сундуком (0,6 × 900 > 500), а на руках —
    // нет (0,6 × 100): купленное ждало бы плюса, улов — без очков. Теперь — улов.
    expect(fish(rows)).toBe(5);
    // Купленное на руках и плюс достижим — по-прежнему первым купленное.
    expect(fish([buy(10, 0.5), caught(3), sell(10, 0.6)])).toBe(10);
  });
});

// Ратуша (83,-36) с прода: «Обычная Рыба» 0,2, норма 600, НЗ 60, наценка 20 %.
const TOWN: TownCurve = { base: 0.2, norm: 600, reserve: 60, markupPct: 20 };

/** Сделки по кривой ратуши: + купил, − продал (штук за раз), запас меняется. */
function town(stock: number, lots: number[], o: Partial<FlowRow> = {}) {
  const rows: FlowRow[] = [];
  for (const k of lots) {
    const q = k > 0 ? quoteBuy(TOWN, stock, k) : quoteSell(TOWN, stock, -k);
    if (!q.ok) throw new Error("ратуша не продаёт");
    rows.push(row({ side: k > 0 ? "buy" : "sell", qty: Math.abs(k), total: q.total, ...o }));
    stock -= k;
  }
  return { rows, stock };
}

describe("круг через ратушу — очков нет (ревью 12.10.2026)", () => {
  it("купил пачкой или по одной, сдал обратно по одной", () => {
    expect(fish(town(600, [540, ...Array<number>(540).fill(-1)]).rows)).toBe(0);
    expect(
      fish(town(600, [...Array<number>(300).fill(1), ...Array<number>(300).fill(-1)]).rows),
    ).toBe(0);
  });

  it("раскачал ратушу А покупкой и сдал в неё рыбу из ратуши С", () => {
    const c = town(600, [100]).rows;
    const pump = town(600, [400]);
    const sold = town(pump.stock, Array<number>(100).fill(-1));
    const back = town(sold.stock, [-400]);
    expect(fish([...c, ...pump.rows, ...sold.rows, ...back.rows])).toBe(0);
  });

  it("честная разница цен между ратушами — засчитана", () => {
    // В ратуше С рыбы с избытком (дёшево), в А — у НЗ (дорого).
    const c = town(6000, [50]).rows;
    const a = town(60, Array<number>(50).fill(-1)).rows;
    expect(fish([...c, ...a])).toBe(50);
  });
});
