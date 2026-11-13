// Статистика пулов банка — только админу (Архан, 21.10.2026: «сколько на комиссии
// заработали, сколько вытащили, график курса»). Чистый расчёт по журналам базы:
//  · bank_pool_fund — наполнение (обе стороны в пул);
//  · bank_swap — обмен: в пул входит amount_in − fee_map (остаток по курсу + 80 %
//    комиссии), из пула уходит amount_out (migrations/bank-05);
//  · bank_buyback (done) — откуп золота за DARAI: все DARAI в пул, gold_out из пула,
//    комиссия целиком остаётся в пуле (migrations/bank-04).
// Проигрыш журнала с нуля даёт запас пула после каждого события — отсюда курс после
// каждого обмена и запас после последнего наполнения. Сверено с продом 22.10.2026:
// проигрыш сходится с bank_pool.reserve_* до знака по всем четырём пулам.
import { startPrice, type BankPool, type BankToken } from "./castleBank";
import { decimalsOf, poolPrice } from "./bankSwap";

export type BankEvent =
  | { kind: "fund"; at: number; a: number; b: number }
  | {
      kind: "swap" | "buyback";
      at: number;
      tokenIn: BankToken;
      amountIn: number;
      amountOut: number;
      feePool: number;
      feeMap: number;
    };

/** Сумма за сутки, за 7 дней и за всё время. */
export type Period = { d1: number; d7: number; all: number };

export type SideStats = {
  token: BankToken;
  /** Комиссия в этом токене (берётся с того, что отдают): осталась в пуле / ушла в пул карты. */
  feePool: Period;
  feeMap: Period;
  /** Объём обменов: сколько этого токена отдали в пул и сколько пул выдал. */
  volIn: Period;
  volOut: Period;
  /** Положено наполнением за всё время. */
  funded: number;
  /** Запас сейчас. */
  reserve: number;
  /** Чистый отток с начала: положено − запас (минус — в пуле прибавилось). */
  outStart: number;
  /** Чистый отток с последнего наполнения: запас сразу после него − запас сейчас. */
  outSinceFund: number;
};

/** Курс после события: сколько B за 1 A. */
export type RatePoint = { t: number; p: number };

export type PoolStats = {
  a: SideStats;
  b: SideStats;
  /** Число обменов (с откупом банка). */
  swaps: Period;
  lastFundAt: number | null;
  /** Курс сейчас и стартовый — B за 1 A. */
  priceNow: number;
  priceStart: number;
  /** Курс после первого наполнения и после каждого обмена, по времени. */
  points: RatePoint[];
  /** Проигрыш журнала сошёлся с запасом пула (иначе запас меняли мимо журналов). */
  consistent: boolean;
};

export const DAY_MS = 86_400_000;

const zero = (): Period => ({ d1: 0, d7: 0, all: 0 });
const roundTo = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

function addTo(p: Period, v: number, age: number): void {
  p.all += v;
  if (age < 7 * DAY_MS) p.d7 += v;
  if (age < DAY_MS) p.d1 += v;
}

const roundPeriod = (p: Period, dp: number): Period => ({
  d1: roundTo(p.d1, dp),
  d7: roundTo(p.d7, dp),
  all: roundTo(p.all, dp),
});

type Acc = {
  fee: Period;
  map: Period;
  vin: Period;
  vout: Period;
  funded: number;
  afterFund: number;
  r: number;
};
const acc = (): Acc => ({
  fee: zero(),
  map: zero(),
  vin: zero(),
  vout: zero(),
  funded: 0,
  afterFund: 0,
  r: 0,
});

function side(token: BankToken, x: Acc, reserve: number, funded: boolean): SideStats {
  const dp = decimalsOf(token);
  return {
    token,
    feePool: roundPeriod(x.fee, dp),
    feeMap: roundPeriod(x.map, dp),
    volIn: roundPeriod(x.vin, dp),
    volOut: roundPeriod(x.vout, dp),
    funded: roundTo(x.funded, dp),
    reserve,
    outStart: roundTo(x.funded - reserve, dp),
    outSinceFund: funded ? roundTo(x.afterFund - reserve, dp) : 0,
  };
}

const near = (x: number, y: number) => Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));

/**
 * Статистика пула по журналам (порядок событий — как в базе, по времени).
 * fundPoints — точка курса и после каждого наполнения, не только первого: наполнение
 * не по курсу сдвигает его (20.10.2026 12:51 — 238,99 → 200). Включает график игрокам
 * (bank-rate.ts); у админа точки — как были.
 */
export function poolStats(
  pool: BankPool,
  events: BankEvent[],
  nowMs: number,
  opts: { fundPoints?: boolean } = {},
): PoolStats {
  const A = acc();
  const B = acc();
  const swaps = zero();
  const points: RatePoint[] = [];
  let lastFundAt: number | null = null;
  for (const e of events) {
    const age = nowMs - e.at;
    if (e.kind === "fund") {
      A.r += e.a;
      B.r += e.b;
      A.funded += e.a;
      B.funded += e.b;
      A.afterFund = A.r;
      B.afterFund = B.r;
      lastFundAt = e.at;
      if ((opts.fundPoints || !points.length) && A.r > 0 && B.r > 0)
        points.push({ t: e.at, p: B.r / A.r });
      continue;
    }
    const inA = e.tokenIn === pool.tokenA;
    if (!inA && e.tokenIn !== pool.tokenB) continue; // чужой токен — не этого пула
    const [src, dst] = inA ? [A, B] : [B, A];
    src.r += e.amountIn - e.feeMap;
    dst.r -= e.amountOut;
    addTo(src.fee, e.feePool, age);
    addTo(src.map, e.feeMap, age);
    addTo(src.vin, e.amountIn, age);
    addTo(dst.vout, e.amountOut, age);
    addTo(swaps, 1, age);
    if (A.r > 0 && B.r > 0) points.push({ t: e.at, p: B.r / A.r });
  }
  const funded = lastFundAt !== null;
  return {
    a: side(pool.tokenA, A, pool.reserveA, funded),
    b: side(pool.tokenB, B, pool.reserveB, funded),
    swaps,
    lastFundAt,
    priceNow: poolPrice(pool),
    priceStart: startPrice(pool),
    points,
    consistent: near(A.r, pool.reserveA) && near(B.r, pool.reserveB),
  };
}

/**
 * Проредить точки для графика: не больше max. Время делится на корзины, в каждой —
 * самая низкая и самая высокая точка (скачки курса не теряются); первая и
 * последняя точки остаются всегда.
 */
export function thinPoints(points: RatePoint[], max = 240): RatePoint[] {
  if (points.length <= max) return points;
  const buckets = Math.max(1, Math.floor((max - 2) / 2));
  const size = Math.ceil(points.length / buckets);
  const out: RatePoint[] = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    let lo = chunk[0];
    let hi = chunk[0];
    for (const p of chunk) {
      if (p.p < lo.p) lo = p;
      if (p.p > hi.p) hi = p;
    }
    if (lo === hi) out.push(lo);
    else if (lo.t <= hi.t) out.push(lo, hi);
    else out.push(hi, lo);
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (out[0] !== first) out.unshift(first);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Как читать курс: «B за 1 A», а если стартово одна A дешевле одной B (золото →
 * алмазы 200 : 1) — наоборот, «A за 1 B», чтобы не читать 0,005.
 */
export function rateView(pool: Pick<BankPool, "tokenA" | "tokenB" | "weightA" | "weightB">): {
  base: BankToken;
  quote: BankToken;
  invert: boolean;
} {
  const invert = startPrice(pool) < 1;
  return invert
    ? { base: pool.tokenB, quote: pool.tokenA, invert }
    : { base: pool.tokenA, quote: pool.tokenB, invert };
}

/** Курс «B за 1 A» в выбранном прочтении. */
export const viewPrice = (p: number, invert: boolean): number => (invert ? (p > 0 ? 1 / p : 0) : p);

/** Изменение курса к стартовому, % (в прочтении rateView). */
export function changePct(now: number, start: number, invert: boolean): number {
  const n = viewPrice(now, invert);
  const s = viewPrice(start, invert);
  return s > 0 ? (n / s - 1) * 100 : 0;
}
