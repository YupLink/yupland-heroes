// Маркет фишек за золото (владелец, 21.10.2026): цена лота — целое золото от 10
// (с 22.10.2026, lib/chipMarketGold — общее с сервером), продавцу 91 % (9 % комиссии
// сгорает), при нехватке — та же фраза, что у сервера
// (server/api/chips-market-gold.ts): «Не хватает золота: нужно N, у тебя M».
import { CHIP_GOLD_PRICE_MAX, CHIP_GOLD_PRICE_MIN } from "@/lib/chipMarketGold";

export const GOLD_PRICE_MIN = CHIP_GOLD_PRICE_MIN;
export const GOLD_PRICE_MAX = CHIP_GOLD_PRICE_MAX;
const FEE_PERCENT = 9;

/** Цена из поля ввода: целое золото 10…1 000 000, иначе null. */
export function parseGoldPrice(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= GOLD_PRICE_MIN && n <= GOLD_PRICE_MAX ? n : null;
}

/** Продавцу после комиссии 9 % — тем же округлением до сотых, что у сервера. */
export function goldSellerGets(price: number): number {
  const fee = Math.round(((price * FEE_PERCENT) / 100) * 100) / 100;
  return Math.round((price - fee) * 100) / 100;
}

/** Золото для показа: до сотых, с разделителем тысяч. */
export const fmtGoldAmt = (n: number, ru: boolean): string =>
  (Number(n) || 0).toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 });

export type GoldShort = { need: number; have: number };

/** Нехватка — только когда баланс известен; null — хватает или баланс ещё не пришёл. */
export function goldShortfall(need: number, have: number | null | undefined): GoldShort | null {
  if (have == null || !Number.isFinite(have) || !(need > 0)) return null;
  return have + 1e-9 < need ? { need, have: Math.floor(have) } : null;
}

/** «Не хватает золота: нужно N, у тебя M» — слово в слово как отказ сервера. */
export const goldShortText = (s: GoldShort, ru: boolean): string =>
  ru ? `Не хватает золота: нужно ${s.need}, у тебя ${s.have}` : `Not enough gold: need ${s.need}, you have ${s.have}`;
