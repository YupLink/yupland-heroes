// Рынок героев (владелец, 22.10.2026; ПРАВИЛА §8.67): правила цены и комиссии —
// чистые, общие для сервера (server/api/hero-market) и интерфейса. Базы не касается.
//
//  · минимум выкладки — в ЗОЛОТЕ по редкости: редкий 1000, эпический 2500,
//    легендарный 5000; обычного выставить нельзя;
//  · цена в DARAI (вместо золота или вместе с ним) — не ниже минимума × курс пула
//    банка gold/Darai (DARAI за 1 золото) на момент выставления, вверх до целого;
//  · комиссия 9 %: продавцу 91 %. Золото — до сотых (как маркет фишек), DARAI — до
//    8 знаков (как счёт).

export type HeroMarketRarity = "rare" | "epic" | "legendary";
export type HeroMarketCurrency = "gold" | "darai";

export const HERO_MARKET_FEE_PERCENT = 9;

/** Минимальная цена лота в золоте по редкости (обычный — не продаётся). */
export const HERO_MARKET_MIN_GOLD: Record<HeroMarketRarity, number> = {
  rare: 1000,
  epic: 2500,
  legendary: 5000,
};

/** Потолки цены: защита от опечатки «лишний ноль», не экономика. */
export const HERO_MARKET_MAX_GOLD = 100_000_000;
export const HERO_MARKET_MAX_DARAI = 1_000_000_000_000;

/** Сколько героев за одно нажатие «Выставить». */
export const HERO_MARKET_BATCH_MAX = 20;

/** Сколько лотов в одной странице выдачи. */
export const HERO_MARKET_PAGE_MAX = 50;

export const isHeroMarketRarity = (r: unknown): r is HeroMarketRarity =>
  r === "rare" || r === "epic" || r === "legendary";

/** Редкость героя — по ярусу шаблона (как rarityOfTemplateLevel). */
export function heroTierRarity(tier: number | null | undefined): HeroMarketRarity | "common" {
  const l = Number(tier) || 0;
  if (l >= 5) return "legendary";
  if (l >= 4) return "epic";
  if (l >= 3) return "rare";
  return "common";
}

/** Минимум DARAI: минимум в золоте × курс, вверх до целого. Курса нет — null. */
export function heroMarketMinDarai(rarity: HeroMarketRarity, rate: number | null): number | null {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.ceil(HERO_MARKET_MIN_GOLD[rarity] * rate);
}

const round = (v: number, dp: number): number => Math.round(v * 10 ** dp) / 10 ** dp;

/** Комиссия и доля продавца: золото — до сотых, DARAI — до 8 знаков (как в базе). */
export function heroMarketSplit(
  price: number,
  currency: HeroMarketCurrency,
): { fee: number; sellerGets: number } {
  const dp = currency === "gold" ? 2 : 8;
  const fee = round((price * HERO_MARKET_FEE_PERCENT) / 100, dp);
  return { fee, sellerGets: round(price - fee, dp) };
}

/** Отказ по цене: ключ словаря и подстановки (min — порог). null — цена годится. */
export type HeroPriceIssue = { error: string; params?: Record<string, number | string> };

const whole = (n: number, max: number): boolean => Number.isInteger(n) && n >= 1 && n <= max;

/** Форма цены без редкости: хоть одна цена, обе — целые от 1 до потолка. */
export function heroMarketPriceFormIssue(
  priceGold: number | null | undefined,
  priceDarai: number | null | undefined,
): HeroPriceIssue | null {
  if (priceGold == null && priceDarai == null) return { error: "heromkt.price_required" };
  if (priceGold != null && !whole(priceGold, HERO_MARKET_MAX_GOLD))
    return { error: "heromkt.price_bad", params: { max: HERO_MARKET_MAX_GOLD } };
  if (priceDarai != null && !whole(priceDarai, HERO_MARKET_MAX_DARAI))
    return { error: "heromkt.price_bad", params: { max: HERO_MARKET_MAX_DARAI } };
  return null;
}

/**
 * Проверка цены лота до базы (база проверяет то же самое под замком — это для
 * понятного ответа по каждому герою пачки). rate — курс пула; нужен только для DARAI.
 */
export function heroMarketPriceIssue(
  rarity: HeroMarketRarity | "common",
  priceGold: number | null | undefined,
  priceDarai: number | null | undefined,
  rate: number | null,
): HeroPriceIssue | null {
  if (rarity === "common") return { error: "heromkt.common" };
  const form = heroMarketPriceFormIssue(priceGold, priceDarai);
  if (form) return form;
  const min = HERO_MARKET_MIN_GOLD[rarity];
  if (priceGold != null && priceGold < min) return { error: "heromkt.gold_min", params: { min } };
  if (priceDarai != null) {
    const minDarai = heroMarketMinDarai(rarity, rate);
    if (minDarai == null) return { error: "heromkt.darai_rate" };
    if (priceDarai < minDarai) return { error: "heromkt.darai_min", params: { min: minDarai } };
  }
  return null;
}
