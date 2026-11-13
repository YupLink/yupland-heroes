// Подписка на энергию — чистые правила (владелец, 29.09.2026): цена в
// валютах, разбивка денег по корзинам, расписание дней. Одинаково читают
// сервер (оплата, выдача, пачки) и клиент (витрина, админка).
//
// Цена тарифа задаётся ТОЛЬКО в $. DARAI и Stars считаются от неё:
//   DARAI = $ × (1 − скидка) × курс,  Stars = $ × (1 + наценка) ÷ курс звезды.
// Скидка и наценка фиксированы здесь; игроку они не показываются.

/** Валюты оплаты — символы токенов единого счёта (acc_ledger). */
export const SUB_TOKENS = ["USDT", "Darai", "STARS"] as const;
export type SubToken = (typeof SUB_TOKENS)[number];

/**
 * Подписки — по одной каждого вида на аккаунт (владелец, 30.10.2026). Купленные до
 * тарифов esub-07 («старый образец») работают до конца и в лимит не входят.
 */
export const SUB_NEW_FORMAT_FROM = "2026-10-25 00:00:00+00";

/** Скидка при оплате DARAI. */
export const DARAI_DISCOUNT = 0.1;
/** Наценка при оплате Stars. */
export const STARS_MARKUP = 0.1;
/** Сколько $ Telegram платит за одну звезду при выводе. */
export const STAR_USD = 0.013;
/** Насколько цена в DARAI может подрасти между витриной и оплатой. */
export const PRICE_SLIP = 0.02;

/** Цена тарифа в валюте. null — DARAI без курса (Ref недоступен). */
export function priceIn(priceUsd: number, token: SubToken, daraiPerUsd: number | null): number | null {
  const usd = Math.max(0, Number(priceUsd) || 0);
  if (token === "USDT") return Math.round(usd * 100) / 100;
  // Вверх — от числа без хвоста двоичной дроби: $39 — это ровно 3300 ⭐, а не
  // 3300.0000000000005 → 3301. Цена в центах, поэтому настоящая дробная часть
  // звёзд — кратна 1/13 и от шести знаков не теряется.
  if (token === "STARS") {
    return Math.ceil(Number(((usd * (1 + STARS_MARKUP)) / STAR_USD).toFixed(6)));
  }
  if (!daraiPerUsd || !(daraiPerUsd > 0)) return null;
  return Math.ceil(usd * (1 - DARAI_DISCOUNT) * daraiPerUsd);
}

/** Цена «подросла» сверх допуска относительно показанной игроку. */
export function priceMovedUp(shown: number, now: number): boolean {
  return now > shown * (1 + PRICE_SLIP) + 1e-9;
}

/** Цена на кнопке: «7 USDT», «593 ⭐», 16 387 046 → «16,4 млн DARAI» / «16.4M DARAI». */
export function subPriceText(token: SubToken, v: number, lang: string): string {
  if (token === "USDT") return `${v} USDT`;
  if (token === "STARS") return `${v.toLocaleString(lang === "en" ? "en-US" : "ru-RU")} ⭐`;
  const m = v / 1e6;
  const s = m.toLocaleString(lang === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 1 });
  return lang === "en" ? `${s}M DARAI` : `${s} млн DARAI`;
}

// ─── Куда идут деньги ───

/** Доли оплаты: пул карты, сжигание, разработчики. */
export const SPLIT = {
  Darai: { map: 0.6, burn: 0.15, dev: 0.25 },
  USDT: { map: 0.3, burn: 0.2, dev: 0.5 },
  STARS: { map: 0.3, burn: 0.2, dev: 0.5 },
} as const;

/**
 * Корзины журнала money_bucket_move. sub_usd_map — доля карты с USDT-оплат:
 * меняется на DARAI сразу после покупки; sub_usd — остальное, по порогу.
 */
export type Bucket =
  | "sub_usd"
  | "sub_usd_map"
  | "sub_burn"
  | "sub_dev"
  | "sub_stars"
  // Выигрыши аукционов админа (DARAI / USDT) — целиком разработчикам (14.10).
  | "auc_darai"
  | "auc_usd"
  // Лицензии банка: доллары половины на откуп золота — меняются на Ref сразу (15.10).
  | "bank_usd";

export type SplitLine = { bucket: Bucket | "map"; token: string; amount: number };

const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

/**
 * Куда ляжет одна оплата. Остаток от округления уходит последней строке —
 * сумма строк всегда ровно равна оплате.
 *  · DARAI: 60 % сразу в пул карты, 15 % — корзина «Сжечь», 25 % — «Разработчики».
 *  · USDT: 30 % — корзина «$ → карта», меняется на DARAI в пул карты сразу
 *    (владелец, 03.10); 70 % — корзина $, по порогу: 20 из 70 — обмен в
 *    пул сжигания (§8.68), 50 из 70 — разработчикам в USDT.
 *  · STARS: 100 % в общий пул звёзд подписок (владелец, 29.09: делятся потом —
 *    выведенные звёзды приходят USDT в корзину $ и делятся 30/20/50 там).
 */
export function splitPayment(token: SubToken, amount: number): SplitLine[] {
  const a = round8(amount);
  if (token === "Darai") {
    const map = round8(a * SPLIT.Darai.map);
    const burn = round8(a * SPLIT.Darai.burn);
    return [
      { bucket: "map", token, amount: map },
      { bucket: "sub_burn", token, amount: burn },
      { bucket: "sub_dev", token, amount: round8(a - map - burn) },
    ];
  }
  if (token === "USDT") {
    const map = Math.floor(a * SPLIT.USDT.map * 1e6) / 1e6;
    return [
      { bucket: "sub_usd_map", token, amount: map },
      { bucket: "sub_usd", token, amount: round8(a - map) },
    ];
  }
  return [{ bucket: "sub_stars", token, amount: a }];
}

/** Доля разработчиков в корзине $ (там 70 % оплаты): 50 из 70. */
export const USD_BUCKET_DEV_SHARE = SPLIT.USDT.dev / (SPLIT.USDT.burn + SPLIT.USDT.dev);

/**
 * Пачка корзины $: доля разработчиков уходит им USDT как есть, остальное
 * меняется на DARAI и целиком идёт в пул сжигания (доля карты ушла ещё при покупке).
 */
export function usdBatchPlan(amount: number, devShare: number) {
  const dev = Math.floor(amount * devShare * 1e6) / 1e6;
  return { swap: round8(amount - dev), dev };
}

// ─── Дни подписки ───

/** Сколько часов подарок дня ждёт игрока: сутки — забрать день в день (владелец, 29.09). */
export const DAY_TTL_HOURS = 24;

/** Номера дней, которые уже наступили к моменту now (1…days). */
export function dueDays(startsAtMs: number, days: number, nowMs: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= days; d++) {
    if (startsAtMs + (d - 1) * 86_400_000 <= nowMs) out.push(d);
  }
  return out;
}

// ─── Пачки рассылки ───

/** Сколько пачка может «идти», прежде чем считаться зависшей (процесс умер посреди). */
export const BATCH_STALE_MS = 15 * 60_000;

/** Пачку можно разбирать руками: встала или зависла. */
export function batchNeedsHands(status: string, updatedAt: string, now = Date.now()): boolean {
  if (status === "failed") return true;
  return status === "running" && now - new Date(updatedAt).getTime() > BATCH_STALE_MS;
}
