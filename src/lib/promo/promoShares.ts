// Шанс строки промокода = её вес / сумма весов (владелец, 05.11.2026: «шансы
// в весах»). Выпадает ровно одна строка — так же считает promo_redeem в базе
// (миграция promo-02), только там из суммы выпадают строки с выбранным объёмом.

/** Доли строк в процентах по весам; веса ≤ 0 и мусор — 0. */
export function promoShares(weights: readonly number[]): number[] {
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const total = w.reduce((s, x) => s + x, 0);
  return w.map((x) => (total > 0 ? (x / total) * 100 : 0));
}

/** «50 %», «33,3 %», «0,1 %» — до десятой, без хвостовых нулей. */
export function promoShareText(pct: number, lang: string): string {
  const n = Math.round(pct * 10) / 10;
  return `${n.toLocaleString(lang === "en" ? "en-US" : "ru-RU")} %`;
}
