// Статистика пулов банка: проигрыш журналов (наполнение, обмен, откуп) даёт запас,
// курс после каждого обмена, комиссию и отток — то же, что пишет база (bank-04/05).
import { describe, expect, it } from "vitest";
import type { BankPool } from "./castleBank";
import { quote } from "./bankSwap";
import {
  DAY_MS,
  changePct,
  poolStats,
  rateView,
  thinPoints,
  viewPrice,
  type BankEvent,
  type RatePoint,
} from "./bankStats";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const H = 3_600_000;

const pool = (over: Partial<BankPool> = {}): BankPool => ({
  id: "bp_x",
  tokenA: "gold",
  tokenB: "Darai",
  weightA: 1,
  weightB: 200,
  reserveA: 0,
  reserveB: 0,
  feePct: 10,
  createdAt: "2026-10-17T00:00:00Z",
  ...over,
});

/** Обмен так, как его проводит база: по quote с текущего запаса. */
function swapOn(
  p: BankPool,
  tokenIn: "gold" | "Darai",
  amount: number,
  at: number,
): { p: BankPool; e: BankEvent } {
  const q = quote(p, tokenIn, amount);
  if (!q) throw new Error("нет котировки");
  const inA = tokenIn === p.tokenA;
  const net = amount - q.fee;
  const next = inA
    ? { ...p, reserveA: p.reserveA + net + q.feePool, reserveB: p.reserveB - q.out }
    : { ...p, reserveB: p.reserveB + net + q.feePool, reserveA: p.reserveA - q.out };
  return {
    p: next,
    e: {
      kind: "swap",
      at,
      tokenIn,
      amountIn: amount,
      amountOut: q.out,
      feePool: q.feePool,
      feeMap: q.feeMap,
    },
  };
}

describe("poolStats", () => {
  it("проигрыш сходится с запасом пула; курс после каждого обмена", () => {
    let p = pool();
    const events: BankEvent[] = [{ kind: "fund", at: NOW - 10 * DAY_MS, a: 1000, b: 200_000 }];
    p = { ...p, reserveA: 1000, reserveB: 200_000 };
    const s1 = swapOn(p, "gold", 100, NOW - 3 * DAY_MS);
    const s2 = swapOn(s1.p, "Darai", 50_000, NOW - 2 * H);
    events.push(s1.e, s2.e);
    const st = poolStats(s2.p, events, NOW);

    expect(st.consistent).toBe(true);
    expect(st.points).toHaveLength(3);
    expect(st.points[0]).toEqual({ t: NOW - 10 * DAY_MS, p: 200 });
    expect(st.points[1].p).toBeCloseTo(s1.p.reserveB / s1.p.reserveA, 9);
    expect(st.points[2].p).toBeCloseTo(s2.p.reserveB / s2.p.reserveA, 9);
    expect(st.priceNow).toBeCloseTo(s2.p.reserveB / s2.p.reserveA, 9);
    expect(st.priceStart).toBe(200);
    expect(st.lastFundAt).toBe(NOW - 10 * DAY_MS);
  });

  it("комиссия по токенам: в пул и в пул карты, за сутки / 7 дней / всё", () => {
    let p = pool({ reserveA: 1000, reserveB: 200_000 });
    const events: BankEvent[] = [{ kind: "fund", at: NOW - 20 * DAY_MS, a: 1000, b: 200_000 }];
    for (const [tok, amt, ago] of [
      ["gold", 100, 10 * DAY_MS],
      ["gold", 50, 3 * DAY_MS],
      ["gold", 10, 2 * H],
      ["Darai", 1000, H],
    ] as const) {
      const s = swapOn(p, tok, amt, NOW - ago);
      p = s.p;
      events.push(s.e);
    }
    const st = poolStats(p, events, NOW);
    // золото: 10 % комиссии, 80 % в пул / 20 % в пул карты
    expect(st.a.feePool).toEqual({ d1: 0.8, d7: 4.8, all: 12.8 });
    expect(st.a.feeMap).toEqual({ d1: 0.2, d7: 1.2, all: 3.2 });
    expect(st.b.feePool).toEqual({ d1: 80, d7: 80, all: 80 });
    expect(st.b.feeMap).toEqual({ d1: 20, d7: 20, all: 20 });
    expect(st.a.volIn).toEqual({ d1: 10, d7: 60, all: 160 });
    expect(st.swaps).toEqual({ d1: 2, d7: 3, all: 4 });
    // DARAI, выданные пулом за золото, — объём выдачи стороны B
    const outB = events
      .filter((e) => e.kind === "swap" && e.tokenIn === "gold")
      .reduce((s, e) => s + (e.kind === "swap" ? e.amountOut : 0), 0);
    expect(st.b.volOut.all).toBeCloseTo(outB, 6);
  });

  it("отток: с начала = положено − запас, с наполнения = запас после него − запас", () => {
    let p = pool({ reserveA: 1000, reserveB: 200_000 });
    const events: BankEvent[] = [{ kind: "fund", at: NOW - 5 * DAY_MS, a: 1000, b: 200_000 }];
    const s1 = swapOn(p, "Darai", 20_000, NOW - 4 * DAY_MS); // забрали золото
    p = s1.p;
    events.push(s1.e);
    const afterFundA = p.reserveA + 500;
    const afterFundB = p.reserveB + (500 * p.reserveB) / p.reserveA;
    events.push({ kind: "fund", at: NOW - 3 * DAY_MS, a: 500, b: afterFundB - p.reserveB });
    p = { ...p, reserveA: afterFundA, reserveB: afterFundB };
    const s2 = swapOn(p, "Darai", 10_000, NOW - DAY_MS / 2);
    p = s2.p;
    events.push(s2.e);
    const st = poolStats(p, events, NOW);

    expect(st.consistent).toBe(true);
    expect(st.a.funded).toBe(1500);
    expect(st.a.outStart).toBeCloseTo(1500 - p.reserveA, 4);
    expect(st.a.outStart).toBeGreaterThan(0); // золото вытащили
    expect(st.b.outStart).toBeLessThan(0); // DARAI в пуле прибавилось
    expect(st.a.outSinceFund).toBeCloseTo(afterFundA - p.reserveA, 4);
    expect(st.a.outSinceFund).toBeCloseTo(s2.e.kind === "swap" ? s2.e.amountOut : 0, 4);
    expect(st.lastFundAt).toBe(NOW - 3 * DAY_MS);
  });

  it("откуп: все DARAI в пул, золото из пула, комиссия — в пул", () => {
    const p0 = pool({ reserveA: 1000, reserveB: 200_000 });
    const amount = 10_000;
    const net = amount * 0.9;
    const goldOut = Math.round(((1000 * net) / (200_000 + net)) * 1e8) / 1e8;
    const p = { ...p0, reserveA: 1000 - goldOut, reserveB: 200_000 + amount };
    const st = poolStats(
      p,
      [
        { kind: "fund", at: NOW - DAY_MS * 2, a: 1000, b: 200_000 },
        {
          kind: "buyback",
          at: NOW - H,
          tokenIn: "Darai",
          amountIn: amount,
          amountOut: goldOut,
          feePool: 1000,
          feeMap: 0,
        },
      ],
      NOW,
    );
    expect(st.consistent).toBe(true);
    expect(st.b.feePool.all).toBe(1000);
    expect(st.points.at(-1)?.p).toBeCloseTo(p.reserveB / p.reserveA, 9);
  });

  it("запас меняли мимо журналов — consistent=false; пустой пул — нули", () => {
    const st = poolStats(pool({ reserveA: 10, reserveB: 2000 }), [], NOW);
    expect(st.consistent).toBe(false);
    expect(st.points).toEqual([]);
    expect(st.lastFundAt).toBeNull();
    expect(st.a.outSinceFund).toBe(0);
    expect(poolStats(pool(), [], NOW).consistent).toBe(true);
  });

  it("обмен чужим токеном не портит проигрыш", () => {
    const st = poolStats(
      pool({ reserveA: 1, reserveB: 200 }),
      [
        { kind: "fund", at: NOW - H, a: 1, b: 200 },
        {
          kind: "swap",
          at: NOW,
          tokenIn: "wood",
          amountIn: 5,
          amountOut: 1,
          feePool: 0,
          feeMap: 0,
        },
      ],
      NOW,
    );
    expect(st.consistent).toBe(true);
    expect(st.swaps.all).toBe(0);
  });

  it("наполнение не по курсу: у админа точки — только с первого, игрокам (fundPoints) — и после него", () => {
    const events: BankEvent[] = [
      { kind: "fund", at: NOW - 2 * H, a: 10, b: 2400 },
      { kind: "fund", at: NOW - H, a: 990, b: 197_600 },
    ];
    const p = pool({ reserveA: 1000, reserveB: 200_000 });
    expect(poolStats(p, events, NOW).points).toEqual([{ t: NOW - 2 * H, p: 240 }]);
    expect(poolStats(p, events, NOW, { fundPoints: true }).points).toEqual([
      { t: NOW - 2 * H, p: 240 },
      { t: NOW - H, p: 200 },
    ]);
  });
});

describe("thinPoints", () => {
  const series = (n: number): RatePoint[] =>
    Array.from({ length: n }, (_, i) => ({
      t: i,
      p: 100 + Math.sin(i / 7) * 10 + (i === 333 ? 500 : 0),
    }));

  it("мало точек — как есть", () => {
    const pts = series(50);
    expect(thinPoints(pts, 240)).toBe(pts);
  });

  it("много — не больше max, первая/последняя и скачок на месте, время по порядку", () => {
    const pts = series(5000);
    const out = thinPoints(pts, 240);
    expect(out.length).toBeLessThanOrEqual(240);
    expect(out[0]).toBe(pts[0]);
    expect(out.at(-1)).toBe(pts.at(-1));
    expect(out.some((p) => p.t === 333)).toBe(true);
    for (let i = 1; i < out.length; i++) expect(out[i].t).toBeGreaterThan(out[i - 1].t);
  });
});

describe("прочтение курса", () => {
  it("золото → алмазы 200:1 читается «золото за 1 алмаз»", () => {
    const v = rateView({ tokenA: "gold", tokenB: "diamonds", weightA: 200, weightB: 1 });
    expect(v).toEqual({ base: "diamonds", quote: "gold", invert: true });
    expect(viewPrice(0.005, true)).toBe(200);
    expect(rateView({ tokenA: "gold", tokenB: "Darai", weightA: 1, weightB: 200 }).invert).toBe(
      false,
    );
  });

  it("изменение к стартовому — в том же прочтении", () => {
    expect(changePct(250, 200, false)).toBeCloseTo(25, 9);
    // B за A упало с 0,005 до 0,004 → золота за алмаз стало больше на 25 %
    expect(changePct(0.004, 0.005, true)).toBeCloseTo(25, 9);
    expect(viewPrice(0, true)).toBe(0);
  });
});
