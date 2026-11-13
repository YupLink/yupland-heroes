// Маркет фишек за золото: границы цены лота — общие для сервера
// (server/api/chips-market-gold.ts) и окна выставления (components/chips/market-gold).
// Минимум — 10 золота (владелец, 22.10.2026: «минимальная цена для фишек на рынке
// = 10 золота а не 200»; было 1). Уже стоящие дешевле лоты висят как есть —
// правило для новых выставлений.
export const CHIP_GOLD_PRICE_MIN = 10;
export const CHIP_GOLD_PRICE_MAX = 1_000_000;

/** Отказ «цена ниже минимума» — ключ словаря с подстановкой (serverErrorText/humanError). */
export const CHIP_PRICE_MIN_ERROR = `market.price_min|${JSON.stringify({ n: CHIP_GOLD_PRICE_MIN })}`;
