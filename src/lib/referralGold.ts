// Рефка золотом (владелец, 01–02.11.2026; ПРАВИЛА §8.101) — чистые правила, общие
// для сервера, ачивок и экрана «Друзья».
//
// «От 10 % до 20 % от трат реферала, в золоте». Считаются покупки друга: подписка и
// золото из лавки золота (не обмен в банке). Подписка — по лавке: $1 = 1 000 золота
// (пакет $150 → 150 000); золото — сколько куплено. Процент растёт с ачивкой
// «Покупки друзей» (сумма покупок всех друзей в золоте). Золото пригласившему — раз
// в сутки; его можно обменять на DARAI без суточного лимита лицензии в течение
// недели после начисления («реферальная лицензия»). В фонд выкупа золота — тот же
// процент от оплаты друга. USDT пригласившему больше не идёт.

/** Подписка в золоте: $1 = 1 000 (лучший пакет лавки, владелец 02.11: «считай по лавке»). */
export const REF_USD_GOLD = 1000;

/** Доля без ачивки, %. */
export const REF_BASE_PCT = 10;

/** «Покупки друзей»: сколько золота купили друзья → доля, % (числа Ярослава, 31.10). */
export const REF_SPEND_TIERS = [1_000, 10_000, 100_000, 500_000, 1_000_000, 10_000_000] as const;
export const REF_TIER_PCTS = [11, 12, 14, 16, 18, 20] as const;

/** «Много друзей»: сколько друзей (каждый потратил от $10) — ачивка торговли. */
export const REF_FRIEND_TIERS = [1, 3, 5, 10, 50, 100] as const;

/** Друг идёт в «Много друзей», когда потратил в игре от $10 (владелец, 02.11). */
export const REF_FRIEND_MIN_USD = 10;
/** Друг идёт в бонус-боксы, когда потратил больше $15 (владелец, 02.11; в игре не пишем). */
export const REF_BOX_MIN_USD = 15;

/**
 * Новая рефка — только для друзей, пришедших с этого дня (владелец, 02.11.2026:
 * «кто до этого всё делал — им не компенсируем — только новым так будет»).
 * referrals.joined_at пишется датой (полночь UTC): пришедший 02.11 — новый.
 */
export const REF_GOLD_SINCE = "2026-11-02T00:00:00Z";

/** Золото с друзей меняется на DARAI без лимита столько дней после начисления. */
export const REF_GOLD_SWAP_DAYS = 7;

const whole = (n: number) => Math.max(0, Number(n) || 0);

/** Доля при сумме покупок друзей `total` (в золоте), %. */
export function refPctFor(total: number): number {
  let pct: number = REF_BASE_PCT;
  REF_SPEND_TIERS.forEach((t, i) => {
    if (whole(total) >= t) pct = REF_TIER_PCTS[i];
  });
  return pct;
}

/** Покупка друга в золоте: подписка — по лавке, золото — как есть. */
export function refGoldEq(kind: "sub" | "gold", usd: number, gold = 0): number {
  return kind === "sub"
    ? Math.round(whole(usd) * 100) * (REF_USD_GOLD / 100)
    : Math.floor(whole(gold));
}

/** Золото пригласившему с покупки: доля от золота, с точностью ресурса (4 знака). */
export function refReward(goldEq: number, pct: number): number {
  return Math.floor(whole(goldEq) * whole(pct) * 100) / 10_000;
}

/** Знаков у монеты оплаты: USDT — 6, DARAI и звёзды — целые. */
const PAY_DP: Record<string, number> = { USDT: 6, Darai: 0, STARS: 0 };

/**
 * Доля фонда выкупа в оплате друга: тот же процент, вниз до точности монеты.
 * share + rest = amount ровно; rest идёт обычной раскладкой. Звёзды — без доли
 * (владелец, 02.11.2026: «звёзды идут на счёт нам, выкуп не идёт, золото
 * выделяется»): вся оплата — обычной раскладкой, пригласившему золото как всем.
 */
export function refBuybackShare(
  token: string,
  amount: number,
  pct: number,
): { share: number; rest: number } {
  const dp = PAY_DP[token] ?? 6;
  const unit = 10 ** dp;
  const total = Math.round(whole(amount) * unit);
  const share = token === "STARS" ? 0 : Math.floor((total * whole(pct)) / 100 + 1e-9);
  return { share: share / unit, rest: (total - share) / unit };
}
