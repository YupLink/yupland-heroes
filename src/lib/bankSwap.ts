// Обмен в банке (владелец, 16.10.2026): формула пула и предпросмотр — то же, что
// считает база (bank_swap_run, migrations/bank-05), до знака.
//  · запас A × запас B = const; цена A = запас B / запас A;
//  · комиссия пула (fee_pct) — с того, что игрок отдаёт; по курсу меняется остаток;
//  · из комиссии 80 % остаётся в пуле (растёт ликвидность), 20 % — в пул карты.
import type { BankPool, BankToken } from "./castleBank";

export const FEE_TO_MAP = 0.2;

/** Знаков после запятой, как в журналах: DARAI — 8, ресурсы — 4. */
export const decimalsOf = (t: BankToken): number => (t === "Darai" ? 8 : 4);

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;
const trunc = (v: number, dp: number) => Math.floor(v * 10 ** dp + 1e-9) / 10 ** dp;

export type Quote = {
  out: number;
  tokenOut: BankToken;
  fee: number;
  feePool: number;
  feeMap: number;
  /** Сколько B за 1 A до и после обмена. */
  priceBefore: number;
  priceAfter: number;
  /** На сколько средняя цена сделки хуже цены до неё, %. */
  impactPct: number;
};

export const poolLive = (p: Pick<BankPool, "reserveA" | "reserveB">) => p.reserveA > 0 && p.reserveB > 0;

/** Сколько B за 1 A сейчас: по запасам, а пул пуст — по стартовому курсу. */
export const poolPrice = (p: BankPool): number =>
  poolLive(p) ? p.reserveB / p.reserveA : p.weightB / p.weightA;

/** Что получит игрок, отдав amount токена tokenIn; null — обменять нельзя. */
export function quote(p: BankPool, tokenIn: BankToken, amount: number): Quote | null {
  if (!poolLive(p) || !(amount > 0)) return null;
  const inA = tokenIn === p.tokenA;
  if (!inA && tokenIn !== p.tokenB) return null;
  const tokenOut = inA ? p.tokenB : p.tokenA;
  const [rIn, rOut] = inA ? [p.reserveA, p.reserveB] : [p.reserveB, p.reserveA];
  const dpIn = decimalsOf(tokenIn);
  const fee = round((amount * p.feePct) / 100, dpIn);
  const feeMap = round(fee * FEE_TO_MAP, dpIn);
  const feePool = round(fee - feeMap, dpIn);
  const net = amount - fee;
  const out = trunc((rOut * net) / (rIn + net), decimalsOf(tokenOut));
  if (!(out > 0) || out >= rOut) return null;
  const a = inA ? p.reserveA + net + feePool : p.reserveA - out;
  const b = inA ? p.reserveB - out : p.reserveB + net + feePool;
  const priceBefore = p.reserveB / p.reserveA;
  const avg = inA ? out / amount : amount / out; // B за A в этой сделке
  const impactPct = inA ? (1 - avg / priceBefore) * 100 : (avg / priceBefore - 1) * 100;
  return { out, tokenOut, fee, feePool, feeMap, priceBefore, priceAfter: b / a, impactPct };
}

/** Сколько B положить к amountA: пул пуст — по стартовому курсу, есть запас — в пропорции запасов. */
export function fundPair(p: BankPool, amountA: number): number {
  const ratio = poolLive(p) ? p.reserveB / p.reserveA : p.weightB / p.weightA;
  return round(amountA * ratio, decimalsOf(p.tokenB));
}
