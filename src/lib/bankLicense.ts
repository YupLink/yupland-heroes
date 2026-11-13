// Лицензии банка на продажу золота за DARAI (владелец, 15.10.2026). Покупка золота
// за DARAI — без лицензии. Лицензия на 30 дней; ступень задаёт, сколько золота в
// сутки можно продать. Цены ФИКСИРОВАННЫЕ (владелец + Архан, 17.10.2026: «в раз 5
// дешевле» и оплата алмазами): DARAI 1 / 5 / 18 млн, алмазы 5 / 22 / 80, доллары —
// прежние $3 / $13 / $32, делённые на 5. Ещё лицензия идёт бонусом к подписке на
// энергию (тариф → ступень, energy_sub.license_tier) — пока подписка действует.
// 31.10.2026: вместо алмазов — звёзды «по системе: +10 % от стоимости в DARAI» (владелец):
// звёзды считаются от цены в DARAI по курсу дня, как у билетов (pricesFromDarai).
// 01.11.2026: алмазы вернулись рядом со звёздами — «вернуть цену в алмазах, но ×2»: в банке
// 50 / 200 / 800 (таблица 25 / 100 / 400 × LICENSE_SELF_MULT). Алмазы — ресурс замка, сгорают.
import { pricesFromDarai } from "./usdTariff";

export type LicenseTierId = "small" | "medium" | "large";

/** Валюта оплаты: DARAI, USDT, звёзды — со счёта Казны; алмазы — из ресурсов замка. */
export type LicenseCurrency = "Darai" | "USDT" | "diamonds" | "STARS";
export const LICENSE_CURRENCIES: readonly LicenseCurrency[] = [
  "Darai",
  "USDT",
  "diamonds",
  "STARS",
];

export type LicenseTier = {
  id: LicenseTierId;
  ru: string;
  en: string;
  /** Сколько золота в сутки можно продать за DARAI. */
  dailyGold: number;
  /** Цена таблицы на LICENSE_DAYS дней; звёзды — от DARAI по курсу (licensePrice). */
  price: { Darai: number; USDT: number; diamonds: number };
};

export const LICENSE_DAYS = 30;

export const LICENSE_TIERS: readonly LicenseTier[] = [
  {
    id: "small",
    ru: "Малая",
    en: "Small",
    dailyGold: 5_000,
    price: { Darai: 1_000_000, USDT: 0.6, diamonds: 25 },
  },
  {
    id: "medium",
    ru: "Средняя",
    en: "Medium",
    dailyGold: 25_000,
    price: { Darai: 5_000_000, USDT: 2.6, diamonds: 100 },
  },
  {
    id: "large",
    ru: "Большая",
    en: "Large",
    dailyGold: 100_000,
    price: { Darai: 18_000_000, USDT: 6.4, diamonds: 400 },
  },
];

export const LICENSE_TIER_IDS = LICENSE_TIERS.map((t) => t.id) as [
  LicenseTierId,
  ...LicenseTierId[],
];

export const licenseTier = (id: string | null | undefined): LicenseTier | undefined =>
  LICENSE_TIERS.find((t) => t.id === id);

/**
 * Покупка лицензии самому, в банке, — вдвое дороже таблицы (владелец, 31.10.2026: «цены на
 * покупку сделай ×2, если просто покупать самому»). Лицензия бонусом к подписке не меняется.
 */
export const LICENSE_SELF_MULT = 2;

/**
 * Цена ступени в валюте — только отсюда: сервер не верит цене из браузера. DARAI, USDT и
 * алмазы — таблица ×2; звёзды — от цены в DARAI по курсу (+10 %, как у билетов), без курса — null.
 */
export function licensePrice(
  tier: LicenseTier,
  currency: LicenseCurrency,
  daraiPerUsd: number | null = null,
): number | null {
  const darai = tier.price.Darai * LICENSE_SELF_MULT;
  if (currency === "STARS") return pricesFromDarai(darai, daraiPerUsd)?.STARS ?? null;
  if (currency === "Darai") return darai;
  if (currency === "diamonds") return tier.price.diamonds * LICENSE_SELF_MULT;
  return Math.round(tier.price.USDT * LICENSE_SELF_MULT * 100) / 100;
}

export type MyLicense = {
  tier: LicenseTierId;
  dailyLimit: number;
  endsAt: string;
  /** Сложенная лицензия: какие виды в неё вошли (по возрастанию). */
  kinds?: LicenseTierId[];
} | null;

/** Действует ли лицензия сейчас. */
export const licenseActive = (l: MyLicense, now = Date.now()): boolean =>
  !!l && Date.parse(l.endsAt) > now;

/**
 * Что будет при покупке ступени: купленные — по одной каждого вида (владелец, 30.10.2026),
 * та же действует — продление, иначе новая рядом с остальными.
 */
export function purchaseKind(
  paid: MyLicense[],
  tier: LicenseTierId,
  now = Date.now(),
): "new" | "extend" {
  return paid.some((l) => l?.tier === tier && licenseActive(l, now)) ? "extend" : "new";
}

/**
 * Лицензия для продажи золота: лимиты РАЗНЫХ видов складываются — купленная и по
 * подпискам (владелец, 30.10.2026: «плюсуются, максимум по одной каждого вида»).
 * Одинаковые виды — один раз: больший лимит, поздний срок. tier — старший вид,
 * endsAt — самый поздний конец, kinds — что сложилось. Ни одной — null.
 */
export function effectiveLicense(list: MyLicense[], now = Date.now()): MyLicense {
  const byKind = new Map<LicenseTierId, NonNullable<MyLicense>>();
  for (const l of list) {
    if (!l || !licenseActive(l, now)) continue;
    const prev = byKind.get(l.tier);
    byKind.set(
      l.tier,
      prev
        ? {
            tier: l.tier,
            dailyLimit: Math.max(prev.dailyLimit, l.dailyLimit),
            endsAt: Date.parse(l.endsAt) > Date.parse(prev.endsAt) ? l.endsAt : prev.endsAt,
          }
        : l,
    );
  }
  const kinds = LICENSE_TIER_IDS.filter((k) => byKind.has(k));
  if (!kinds.length) return null;
  const parts = kinds.map((k) => byKind.get(k)!);
  return {
    tier: kinds[kinds.length - 1],
    dailyLimit: parts.reduce((sum, p) => sum + p.dailyLimit, 0),
    endsAt: parts.reduce(
      (a, p) => (Date.parse(p.endsAt) > Date.parse(a) ? p.endsAt : a),
      parts[0].endsAt,
    ),
    kinds,
  };
}
