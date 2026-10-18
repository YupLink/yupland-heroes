// Бонус к рыбалке (владелец, 14.10.2026).
//
// База шанса поимки — настройка мира (10 %), игрок её не видит. Все бонусы —
// В ПРОЦЕНТАХ ОТ БАЗЫ и просто складываются:
//   • артефакт с полем «Бонус к рыбалке, %» — сколько вписал админ;
//   • удача героя — каждые полные 50 дают +10 % (пассивно, от 50 и выше).
// Пример владельца: артефакт +50 % и удача 50 (+10 %) = +60 % → 10 × 1,6 = 16 %.
//
// Шанс может выйти дробным (10 × 1,15 = 11,5 %) — бросок это умеет
// (fishing.fishHit), а потолок — 100 %: ловить чаще, чем каждый раз, нельзя.

/** Каждые столько удачи — ступень бонуса. */
export const LUCK_STEP = 50;
/** Ступень удачи даёт столько процентов к базе. */
export const LUCK_STEP_PCT = 10;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Бонус удачи, % к базе: 49 — ноль, 50 — +10, 120 — +20. */
export function luckFishBonus(luck: unknown): number {
  return Math.floor(Math.max(0, num(luck)) / LUCK_STEP) * LUCK_STEP_PCT;
}

/** Бонус артефакта, % к базе: пусто и мусор — ноль, минус — ноль. */
export const artFishBonus = (v: unknown): number => Math.max(0, Math.round(num(v) * 10) / 10);

/** Итоговый бонус героя: надетые артефакты + удача. */
export function heroFishBonus(o: {
  gear: ReadonlyArray<{ fishBonusPct?: unknown }>;
  luck: unknown;
}): number {
  const arts = o.gear.reduce((s, g) => s + artFishBonus(g.fishBonusPct), 0);
  return Math.round((arts + luckFishBonus(o.luck)) * 10) / 10;
}

/** Шанс с бонусом: база × (1 + бонус / 100), с точностью до сотых и не выше 100 %. */
export function fishChanceWith(basePct: number, bonusPct: number): number {
  const base = Math.max(0, num(basePct));
  const pct = base * (1 + Math.max(0, num(bonusPct)) / 100);
  return Math.min(100, Math.round(pct * 100) / 100);
}

/** Подпись бонуса: «+60 %», «+12,5 %». Ноль — пустая строка: о нуле молчим. */
export function fishBonusText(bonusPct: number, lang: "ru" | "en" = "ru"): string {
  const n = Math.round(num(bonusPct) * 10) / 10;
  if (!(n > 0)) return "";
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", lang === "ru" ? "," : ".");
  return `+${s} %`;
}
