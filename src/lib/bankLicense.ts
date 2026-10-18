// Лицензии банка на продажу золота за DARAI (владелец, 15.10.2026). Покупка золота
// за DARAI — без лицензии. Лицензия на 30 дней; ступень задаёт, сколько золота в
// сутки можно продать. Цены ФИКСИРОВАННЫЕ (владелец + Архан, 17.10.2026: «в раз 5
// дешевле» и оплата алмазами): DARAI 1 / 5 / 18 млн, алмазы 5 / 22 / 80, доллары —
// прежние $3 / $13 / $32, делённые на 5. Ещё лицензия идёт бонусом к подписке на
// энергию (тариф → ступень, energy_sub.license_tier) — пока подписка действует.
export type LicenseTierId = "small" | "medium" | "large";

/** Валюта оплаты: DARAI или USDT со счёта, алмазы — из ресурсов замка (сгорают). */
export type LicenseCurrency = "Darai" | "USDT" | "diamonds";

export type LicenseTier = {
  id: LicenseTierId;
  ru: string;
  en: string;
  /** Сколько золота в сутки можно продать за DARAI. */
  dailyGold: number;
  /** Цена на LICENSE_DAYS дней в каждой валюте. */
  price: Record<LicenseCurrency, number>;
};

export const LICENSE_DAYS = 30;

export const LICENSE_TIERS: readonly LicenseTier[] = [
  {
    id: "small",
    ru: "Малая",
    en: "Small",
    dailyGold: 5_000,
    price: { Darai: 1_000_000, USDT: 0.6, diamonds: 5 },
  },
  {
    id: "medium",
    ru: "Средняя",
    en: "Medium",
    dailyGold: 25_000,
    price: { Darai: 5_000_000, USDT: 2.6, diamonds: 22 },
  },
  {
    id: "large",
    ru: "Большая",
    en: "Large",
    dailyGold: 100_000,
    price: { Darai: 18_000_000, USDT: 6.4, diamonds: 80 },
  },
];

export const LICENSE_TIER_IDS = LICENSE_TIERS.map((t) => t.id) as [
  LicenseTierId,
  ...LicenseTierId[],
];

export const licenseTier = (id: string | null | undefined): LicenseTier | undefined =>
  LICENSE_TIERS.find((t) => t.id === id);

/** Цена ступени в валюте — только отсюда: сервер не верит цене из браузера. */
export const licensePrice = (tier: LicenseTier, currency: LicenseCurrency): number =>
  tier.price[currency];

export type MyLicense = { tier: LicenseTierId; dailyLimit: number; endsAt: string } | null;

/** Действует ли лицензия сейчас. */
export const licenseActive = (l: MyLicense, now = Date.now()): boolean =>
  !!l && Date.parse(l.endsAt) > now;

/** Что будет при покупке ступени: продление той же или замена с этой минуты (только купленная). */
export function purchaseKind(
  cur: MyLicense,
  tier: LicenseTierId,
  now = Date.now(),
): "new" | "extend" | "replace" {
  if (!licenseActive(cur, now)) return "new";
  return cur!.tier === tier ? "extend" : "replace";
}

/**
 * Какая лицензия действует для продажи золота: купленная или по подписке — та, у
 * которой суточный лимит больше (лимиты не складываются); ступени равны — та, что
 * дольше. Ни одной — null.
 */
export function effectiveLicense(paid: MyLicense, sub: MyLicense, now = Date.now()): MyLicense {
  const live = [paid, sub].filter((l) => licenseActive(l, now));
  if (live.length === 0) return null;
  return live.reduce((a, b) =>
    b!.dailyLimit > a!.dailyLimit ||
    (b!.dailyLimit === a!.dailyLimit && Date.parse(b!.endsAt) > Date.parse(a!.endsAt))
      ? b
      : a,
  );
}
