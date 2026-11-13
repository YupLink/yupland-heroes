// Маркет фишек за ЗОЛОТО (владелец, 21.10.2026: «выставлять на продажу фишки снова
// можно — но должны использоваться для этого уже золото»). Цена нового лота — целое
// золото от 10 (с 22.10.2026, lib/chipMarketGold) до 1 000 000 в
// chip_market_listings.price_gold (миграция chipmkt-gold-01), price_tickets
// у него 0. Покупатель платит золотом (res_move, вид chip_market_buy), продавцу — 91 %
// (chip_market_sale), 9 % комиссии сгорает: никому не начисляется, только строка fee
// в журнале маркета. Старые лоты в билетах золотом не продаются и не показываются.
import { z } from "zod";
import { pg } from "../db/pg";
import {
  CHIP_GOLD_PRICE_MAX,
  CHIP_GOLD_PRICE_MIN,
  CHIP_PRICE_MIN_ERROR,
} from "@/lib/chipMarketGold";

export const MARKET_FEE_PERCENT = 9;
export const GOLD_PRICE_MAX = CHIP_GOLD_PRICE_MAX;
/** Цена лота: целое золото 10…1 000 000. */
export const goldPriceSchema = z.number().int().min(CHIP_GOLD_PRICE_MIN).max(GOLD_PRICE_MAX);

/**
 * Вход ручек выставления (одиночной и пачкой), до схемы. Старая вкладка шлёт цену в
 * билетах — «Обнови страницу», а не лот за билеты. Цена ниже минимума (10) — отказ
 * ключом словаря с числом (ru/en), а не сырой ошибкой схемы.
 */
export function requireGoldPrice(d: unknown): unknown {
  const o = (d ?? {}) as Record<string, unknown>;
  if (o.priceGold === undefined && o.priceTickets !== undefined)
    throw new Error("Обнови страницу — цены теперь в золоте");
  const g = o.priceGold;
  if (typeof g === "number" && Number.isFinite(g) && g < CHIP_GOLD_PRICE_MIN)
    throw new Error(CHIP_PRICE_MIN_ERROR);
  return d;
}

/** Отказ той же формы, что у крафта, паков и лайков. */
export const goldShortError = (need: number, have: number): Error =>
  new Error(`Не хватает золота: нужно ${need}, у тебя ${Math.floor(have)}`);

/** Комиссия 9 % (до сотых, как в market_buy_batch) и доля продавца. */
export function goldSplit(price: number): { fee: number; sellerGets: number } {
  const fee = Math.round(((price * MARKET_FEE_PERCENT) / 100) * 100) / 100;
  return { fee, sellerGets: Math.round((price - fee) * 100) / 100 };
}

/** Цена лота в золоте; null — лот за билеты (до 21.10), золотом не продаётся. */
export function listingGoldPrice(row: object): number | null {
  const n = Number((row as { price_gold?: unknown }).price_gold);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** Сумма сделки для истории: золото у новых лотов, билеты — у старых. */
export const goldOrTickets = (gold: unknown, tickets: unknown): { gold: number } | { tickets: number } =>
  gold != null ? { gold: Number(gold) } : { tickets: Number(tickets) };

/** Новый лот за золото (price_tickets = 0). Бросает, если строка не записалась. */
export async function insertGoldListing(row: {
  id: string;
  account: string;
  wallet: string;
  chipId: string;
  priceGold: number;
  now: string;
}): Promise<void> {
  const { error } = await pg.chipMarketListings.raw().insert({
    id: row.id,
    seller_account: row.account,
    buyer_account: null,
    seller_wallet: row.wallet,
    chip_id: row.chipId,
    price_tickets: 0,
    price_gold: row.priceGold,
    status: "active",
    buyer_wallet: null,
    sold_price_tickets: null,
    created_at: row.now,
    sold_at: null,
  });
  if (error) throw new Error(`chip_market_listings.insert: ${error.message}`);
}
