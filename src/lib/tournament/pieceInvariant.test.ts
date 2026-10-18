// Инвариант штучного учёта на переборе (владелец, 14.10.2026: «да, засчитывай
// все»): своё засчитывается, когда бы ни пришло, но очков у игрока НЕ БОЛЬШЕ,
// чем его своего засчитываемого (улов, своя грядка) и купленного им самим
// дешевле цены той продажи, с которой оно ушло (каждая покупка — один раз), —
// а купленное даёт очко только в плюсе. Чужое (полка, мешочек твина), бокс,
// обмен, продажа до записи очков не прибавляют. Истории — случайные, с сидом.
// Ревью 14.10.2026: при потолке «своё + всё купленное» круги «купил по 1,20 →
// сдал по 1,00» на прибыли с дешёвого запаса в него укладывались.
import { describe, expect, it } from "vitest";
import type { FlowRow } from "@/lib/tournament/flowAct";
import { FISH_SALE_RULE, POTION_DRINK_RULE, pieceFlow } from "@/lib/tournament/pieceFlow";

/** Детерминированный ГПСЧ (mulberry32): тот же сид — та же история. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS = [
  "catch",
  "grow",
  "growShelf",
  "buy",
  "buy",
  "buy",
  "prize",
  "swap",
  "sell",
  "sell",
  "sell",
  "put",
  "take",
  "pay",
  "bagPut",
  "bagTake",
] as const;
type Kind = (typeof KINDS)[number];

/** Одна строка журнала вида k; unit — цена за штуку покупки или продажи. */
function make(k: Kind, i: number, acc: string, qty: number, unit: () => number): FlowRow {
  const base = { id: `x${String(i).padStart(3, "0")}`, at: (i + 1) * 10, account: acc, qty };
  const o = { total: 0, cur: "gold", place: "m:2,2" as string | null };
  const other = acc === "A" ? "B" : "A";
  const rows: Record<Kind, Partial<FlowRow>> = {
    catch: { source: "fish", side: "take" },
    grow: { source: "field", side: "take", ref: `fw:1,1:k${i}:own` },
    growShelf: { source: "field", side: "put", ref: `fw:1,1:k${i}:shared` },
    buy: { source: "town", side: "buy", total: qty * unit(), place: null },
    prize: { source: "mystic", side: "buy", cur: "box", place: null },
    swap: { source: "market", side: "buy", cur: "stone", place: null },
    sell: { source: "town", side: "sell", total: qty * unit(), place: null },
    put: { source: "wh_put", side: "put" },
    take: { source: "wh_take", side: "take" },
    pay: { source: "market", side: "pay", ref: `mkt:x${i}:pay0:0` },
    bagPut: { source: "loot_bag", side: "put", place: "m:3,3" },
    bagTake: { source: "loot_bag", side: "take", place: "m:3,3", counterparty: other },
  };
  return { ...base, ...o, source: "", side: "", ...rows[k] } as FlowRow;
}

type Case = { rows: FlowRow[]; start: number; joined: Map<string, number>; cheap: boolean };

function gen(seed: number): Case {
  const r = rng(seed);
  const cheap = r() < 0.4;
  const rows: FlowRow[] = [];
  const len = 4 + Math.floor(r() * 20);
  for (let i = 0; i < len; i++) {
    const k = KINDS[Math.floor(r() * KINDS.length)];
    const acc = r() < 0.65 ? "A" : "B";
    const qty = 1 + Math.floor(r() * 6);
    // Дёшево: покупка 10–20 за штуку, продажа 1–9; иначе — целые 1–30 (и ничьи цен).
    const buyish = k === "buy";
    const unit = () => (cheap ? (buyish ? 10 + r() * 10 : 1 + r() * 8) : 1 + Math.floor(r() * 30));
    rows.push(make(k, i, acc, qty, unit));
  }
  const at = () => Math.floor(r() * (len + 2)) * 10;
  const joined = new Map<string, number>([["A", at()]]);
  if (r() < 0.5) joined.set("B", at());
  return { rows, start: at(), joined, cheap };
}

/**
 * Сколько штук acc получил из своего засчитываемого и купил сам за деньги до
 * t; cash — вся выручка минус траты на покупки с from (с записи): потолок
 * плюса по купленному (купленное раньше идёт туда ещё и в минус).
 */
function sources(rows: readonly FlowRow[], acc: string, t: number, from = -Infinity) {
  let mined = 0;
  let bought = 0;
  let cash = 0;
  for (const x of rows) {
    if (x.account !== acc || x.at > t) continue;
    if (x.source === "fish" || x.source === "field") mined += x.qty;
    if (x.source === "town" && x.side === "buy") bought += x.qty;
    if (x.at < from) continue;
    if (x.source === "town" && x.side === "buy") cash -= x.total;
    if (x.side === "sell") cash += x.total;
  }
  return { mined, bought, cash };
}

/**
 * Лучшая честная раскладка купленного acc по его продажам с cut: штука куплена
 * до продажи и дешевле её цены, каждая — один раз. Жадно по времени: продаже —
 * самая дорогая из подходящих (дешёвые годятся и продажам подешевле).
 */
function matchCap(rows: readonly FlowRow[], acc: string, cut: number): number {
  const lots: number[] = [];
  let n = 0;
  for (const x of rows) {
    if (x.account !== acc) continue;
    if (x.source === "town" && x.side === "buy")
      for (let i = 0; i < x.qty; i++) lots.push(x.total / x.qty);
    if (x.side !== "sell" || x.at < cut) continue;
    for (let k = 0; k < x.qty; k++) {
      const price = x.total / x.qty;
      let best = -1;
      for (let i = 0; i < lots.length; i++)
        if (price > lots[i] + 1e-9 && (best < 0 || lots[i] > lots[best])) best = i;
      if (best < 0) break;
      lots.splice(best, 1);
      n++;
    }
  }
  return n;
}

describe("инвариант «Продажи рыбы» на переборе", () => {
  it("очков не больше своего засчитываемого + купленного самим в плюсе", () => {
    for (let seed = 1; seed <= 6000; seed++) {
      const c = gen(seed);
      const pts = pieceFlow(c.rows, {
        start: c.start,
        since: c.start,
        till: 1e9,
        rule: FISH_SALE_RULE,
        joined: c.joined,
      });
      for (const acc of ["A", "B"]) {
        const cut = Math.max(c.start, c.joined.get(acc) ?? Infinity);
        const mine = pts.filter((p) => p.account === acc);
        const total = mine.reduce((s, p) => s + p.qty, 0);
        const all = sources(c.rows, acc, Infinity);
        const sold = c.rows
          .filter((x) => x.account === acc && x.side === "sell" && x.at >= cut)
          .reduce((s, x) => s + x.qty, 0);
        const tag = `seed ${seed}, ${acc}`;
        // Очко — только продажа после записи и старта, не больше проданного.
        for (const p of mine) expect(p.at >= cut, tag).toBe(true);
        expect(total, tag).toBeLessThanOrEqual(sold);
        // Своё засчитываемое + купленное самим дешевле своей продажи — потолок.
        expect(total, tag).toBeLessThanOrEqual(all.mined + all.bought);
        expect(total, tag).toBeLessThanOrEqual(all.mined + matchCap(c.rows, acc, cut));
        // Продают дешевле любой покупки — купленное очков не даёт.
        if (c.cheap) expect(total, tag).toBeLessThanOrEqual(all.mined);
        // Купленное — только в плюсе: сверх своего засчитываемого очков не
        // больше, чем куплено к последней продаже, где игрок был в плюсе.
        let used = 0;
        let cap = 0;
        for (const p of mine) {
          const s = sources(c.rows, acc, p.at, cut);
          if (s.cash > 0) cap = s.bought;
          used += p.qty;
          expect(used, tag).toBeLessThanOrEqual(s.mined + cap);
        }
      }
    }
  });
});

describe("инвариант «Зелий скорости»: чужое не засчитывается", () => {
  it("всё выпитое пришло от твина — очков нет, сколько бы ни перекидывали", () => {
    for (let seed = 1; seed <= 1500; seed++) {
      const r = rng(seed);
      const rows: FlowRow[] = [];
      let shelf = 0;
      let held = 0;
      for (let i = 0; i < 12; i++) {
        const q = 1 + Math.floor(r() * 4);
        const at = (i + 1) * 10;
        const row = (o: Partial<FlowRow>) =>
          ({
            id: `p${String(i).padStart(3, "0")}`,
            at,
            qty: q,
            total: q,
            cur: "gold",
            place: "m:2,2",
            ...o,
          }) as FlowRow;
        const k = r();
        if (k < 0.3) rows.push(row({ account: "B", source: "market", side: "buy", place: null }));
        else if (k < 0.55) {
          rows.push(row({ account: "B", source: "wh_put", side: "put" }));
          shelf += q;
        } else if (k < 0.8 && shelf >= q) {
          rows.push(row({ account: "A", source: "wh_take", side: "take" }));
          shelf -= q;
          held += q;
        } else if (held >= q) {
          rows.push(row({ account: "A", source: "drink", side: "use", place: null, cur: "" }));
          held -= q;
        }
      }
      const pts = pieceFlow(rows, { start: 0, since: 0, till: 1e9, rule: POTION_DRINK_RULE });
      expect(
        pts.filter((p) => p.account === "A"),
        `seed ${seed}`,
      ).toEqual([]);
    }
  });
});
