// Стейкинг банка (владелец + Архан, 16.10.2026, ПРАВИЛА §8.51) — числа для сервера
// и окна. Вклад DARAI копит золото по фиксу: 1 % годовых = 50 золота в год на 1 млн
// DARAI (курс 200 DARAI за золото), цена пула банка не влияет. Без лока — 30 %, за
// лок надбавка: 1 мес +5, 3 мес +10, 6 мес +15, 12 мес +20. Холдеры и обычные
// DARAI — одинаково. Золото — раз в сутки для всех в 00:00 UTC, первое — в ближайшую
// же полночь после вклада (вложил 16.10 — первое золото 17.10 в 00:00). Снять раньше
// срока — вернуть 50 % начисленного золота (назад в пул). Внутри игры комиссии в
// DARAI нет; при выводе из игры DARAI из NFT-холдера ждут 7 или 30 дней и платят
// 5 %, обычные DARAI — без комиссии.

export type StakePlanId = "free" | "m1" | "m3" | "m6" | "m12";
export type StakePlan = { id: StakePlanId; days: number; pct: number; ru: string; en: string };

export const STAKE_PLANS: readonly StakePlan[] = [
  { id: "free", days: 0, pct: 30, ru: "Без лока", en: "No lock" },
  { id: "m1", days: 30, pct: 35, ru: "1 месяц", en: "1 month" },
  { id: "m3", days: 90, pct: 40, ru: "3 месяца", en: "3 months" },
  { id: "m6", days: 180, pct: 45, ru: "6 месяцев", en: "6 months" },
  { id: "m12", days: 365, pct: 50, ru: "12 месяцев", en: "12 months" },
];

export const stakePlan = (id: string): StakePlan | undefined =>
  STAKE_PLANS.find((p) => p.id === id);

/** Фикс: золота в год на 1 млн DARAI за каждый 1 % годовых. */
export const GOLD_PER_MILLION_PCT = 50;
/** Доля начисленного золота, которую возвращают, снимая вклад раньше срока. */
export const EARLY_BACK_SHARE = 0.5;
/** Комиссия при выводе из игры DARAI, пришедших из NFT-холдера. */
export const HOLDER_FEE = 0.05;

const GOLD_DP = 1e4;

/** Золота в сутки за вклад (сервер пишет это число во вклад, база только умножает). */
export function goldPerDay(amount: number, pct: number): number {
  return Math.floor(((amount / 1e6) * pct * GOLD_PER_MILLION_PCT * GOLD_DP) / 365) / GOLD_DP;
}

/** Сколько золота вернуть за снятие раньше срока: половина начисленного. */
export function earlyBack(goldPaid: number): number {
  return Math.ceil(goldPaid * EARLY_BACK_SHARE * GOLD_DP) / GOLD_DP;
}

export type MyStake = {
  id: string;
  source: "darai" | "holder";
  plan: StakePlanId;
  pct: number;
  amount: number;
  holder: number;
  goldDay: number;
  goldPaid: number;
  lockUntil: string | null;
  /** Вклад NFT-холдера: раньше этого момента не снять вовсе (bank-10). Старый ответ — нет поля. */
  holdUntil?: string | null;
  createdAt: string;
  nftTitle: string | null;
};

/** Вклад NFT-холдера ещё на сроке — снять нельзя никак (не лок с возвратом золота). */
export const stakeHeld = (s: Pick<MyStake, "holdUntil">, now = Date.now()): boolean =>
  !!s.holdUntil && Date.parse(s.holdUntil) > now;

/** Вклад ещё в локе — снять можно только вернув золото. */
export const stakeLocked = (s: Pick<MyStake, "lockUntil">, now = Date.now()): boolean =>
  !!s.lockUntil && Date.parse(s.lockUntil) > now;

// ── NFT «Yupik holder (N million darai)» ──

/** Номиналы из коллекции; holder+ — только 100 млн. */
const HOLDER_MILLIONS = new Set([1, 4, 5, 10, 15, 20, 25, 50, 60, 100, 250, 500]);
/** «unlock 4 weeks» в описании NFT — 30 дней; «minus the commission» — 7. */
const UNLOCK_30 = new Set([10, 15, 20, 60]);

export type HolderNft = { millions: number; darai: number; unlockDays: 7 | 30 };

export function holderNft(title: string | null | undefined): HolderNft | null {
  const m = /^\s*yupik holder(\+)?\s*\(\s*(\d+)\s*million\s+darai\s*\)\s*$/i.exec(title ?? "");
  if (!m) return null;
  const plus = !!m[1];
  const millions = Number(m[2]);
  if (!HOLDER_MILLIONS.has(millions) || (plus && millions !== 100)) return null;
  return { millions, darai: millions * 1e6, unlockDays: plus || UNLOCK_30.has(millions) ? 30 : 7 };
}

// ── Вывод DARAI с меткой холдеров ──

export type HolderPart = {
  days: 7 | 30;
  holder: number;
  gross: number;
  fee: number;
  payout: number;
};
export type WithdrawSplit = { plain: number; parts: HolderPart[] };

/** Комиссия и выплата части: выплата — целыми, остаток округления — в комиссию. */
function part(days: 7 | 30, holder: number, gross: number): HolderPart {
  const payout = Math.floor(gross - holder * HOLDER_FEE);
  return { days, holder, gross, fee: Math.round((gross - payout) * 1e8) / 1e8, payout };
}

/**
 * Как разложится вывод (та же раскладка, что holder_withdraw_request в базе):
 * обычные DARAI — сразу и без комиссии, DARAI холдеров — последними, сначала
 * 7-дневные, потом 30-дневные. Дробный хвост обычных едет с первой частью.
 */
export function holderWithdrawSplit(
  amount: number,
  balance: number,
  d7: number,
  d30: number,
): WithdrawSplit {
  const tagged = d7 + d30;
  const plainHave = Math.max(0, balance - tagged);
  const plain = Math.min(amount, Math.floor(plainHave));
  const rest = amount - plain;
  if (rest <= 0) return { plain, parts: [] };
  const free = Math.min(rest, plainHave - plain);
  const h7 = Math.min(d7, rest - free);
  const h30 = Math.min(d30, rest - free - h7);
  const freeTo7 = h7 > 0 || h30 === 0;
  const parts: HolderPart[] = [];
  if (h7 + (freeTo7 ? free : 0) > 0) parts.push(part(7, h7, h7 + (freeTo7 ? free : 0)));
  if (h30 + (freeTo7 ? 0 : free) > 0) parts.push(part(30, h30, h30 + (freeTo7 ? 0 : free)));
  return { plain, parts };
}
