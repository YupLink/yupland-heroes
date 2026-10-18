// Тариф в $ для билетов и энергопаков (владелец, 07.10.2026): «тарифы за $,
// цена — как у подписки, динамическая». Один знаменатель на все покупки:
// цена задаётся ТОЛЬКО в $, а USDT, DARAI и Stars считаются от неё по тем же
// правилам, что у подписки на энергию (lib/energySub.ts):
//   USDT = $,  DARAI = $ × (1 − 10 %) × курс,  Stars = $ × (1 + 10 %) ÷ 0,013.
// Платят со счёта Казны. Курс DARAI — тот же кэш Ref, что у подписки.
import { DARAI_DISCOUNT, priceIn, priceMovedUp, type SubToken } from "./energySub";

/** Валюты тарифа в $ — символы токенов счёта (acc_ledger). */
export const USD_TOKENS = ["USDT", "Darai", "STARS"] as const satisfies readonly SubToken[];
export type UsdToken = (typeof USD_TOKENS)[number];

/** Цены тарифа во всех валютах. Darai = null — курса нет (Ref недоступен). */
export type UsdPrices = Record<UsdToken, number | null>;

/**
 * Цена тарифа в каждой валюте. `discountPct` — скидка подписки Yupland: как и
 * прежде у токеновых цен, касается USDT и DARAI, звёзды — без скидки.
 */
export function usdPrices(usd: number, daraiPerUsd: number | null, discountPct = 0): UsdPrices {
  const off = Math.min(100, Math.max(0, discountPct || 0)) / 100;
  const disc = usd * (1 - off);
  return {
    USDT: priceIn(disc, "USDT", daraiPerUsd),
    Darai: priceIn(disc, "Darai", daraiPerUsd),
    STARS: priceIn(usd, "STARS", daraiPerUsd),
  };
}

/**
 * Цена задана в DARAI (владелец, 07.10.2026: «если DARAI — пляши от них»):
 * DARAI остаётся ровно как стоит, USDT и звёзды считаются от неё по курсу —
 * в тех же соотношениях, что у подписки (DARAI на 10 % дешевле $, звёзды на
 * 10 % дороже). Нет курса — null: остаются прежние фиксированные цены.
 */
export function pricesFromDarai(
  darai: number,
  daraiPerUsd: number | null,
  discountPct = 0,
): UsdPrices | null {
  if (!(darai > 0) || !daraiPerUsd || !(daraiPerUsd > 0)) return null;
  const usd = darai / ((1 - DARAI_DISCOUNT) * daraiPerUsd);
  const off = Math.min(100, Math.max(0, discountPct || 0)) / 100;
  return {
    USDT: priceIn(usd * (1 - off), "USDT", daraiPerUsd),
    Darai: Math.ceil(darai * (1 - off)),
    STARS: priceIn(usd, "STARS", daraiPerUsd),
  };
}

/** Цена в одной валюте; ошибка, если её не посчитать. */
export function usdPriceOrThrow(
  usd: number,
  token: UsdToken,
  daraiPerUsd: number | null,
  discountPct = 0,
): number {
  const p = usdPrices(usd, daraiPerUsd, discountPct)[token];
  if (p == null || !(p > 0)) {
    throw new Error(
      token === "Darai"
        ? "Курс DARAI сейчас недоступен — оплати USDT или звёздами"
        : "Не удалось посчитать цену",
    );
  }
  return p;
}

/**
 * Игрок видел одну цену, а курс DARAI успел вырасти больше допуска (2 %) —
 * не списываем молча больше показанного.
 */
export function assertShownPrice(shown: number | undefined, now: number): void {
  if (shown != null && priceMovedUp(shown, now)) {
    throw new Error("Цена изменилась — открой окно покупки заново, там новая цена");
  }
}

/** Подпись валюты для игрока. */
export function usdTokenLabel(token: UsdToken, ru: boolean): string {
  if (token === "STARS") return ru ? "Stars из Казны" : "Stars from Treasury";
  if (token === "USDT") return ru ? "USDT из Казны" : "USDT from Treasury";
  return ru ? "DARAI из Казны" : "DARAI from Treasury";
}
