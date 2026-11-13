// Числа и время в статистике пулов банка: суммы — коротко (млн, без хвоста DARAI в
// 8 знаков), курс — с точностью по величине, отток — со знаком словами.

const loc = (ru: boolean) => (ru ? "ru-RU" : "en-US");

/** Сумма: от миллиона — «89,31 млн» (от сотни миллионов — «101,6 млн»), от сотни — целые, меньше — до 2–4 знаков. */
export function fmtStat(n: number, ru: boolean): string {
  const a = Math.abs(n);
  if (a >= 1e6)
    return `${(n / 1e6).toLocaleString(loc(ru), { maximumFractionDigits: a >= 1e8 ? 1 : 2 })} ${ru ? "млн" : "M"}`;
  const dp = a >= 100 ? 0 : a >= 1 ? 2 : 4;
  return n.toLocaleString(loc(ru), { maximumFractionDigits: dp });
}

/** Курс: от сотни — 2 знака, от единицы — 4, меньше — 6. */
export function fmtRate(n: number, ru: boolean): string {
  const a = Math.abs(n);
  const dp = a >= 100 ? 2 : a >= 1 ? 4 : 6;
  return n.toLocaleString(loc(ru), { maximumFractionDigits: dp });
}

/** Отток: плюс — вытащили, минус — в пуле прибавилось. */
export function fmtOutflow(v: number, ru: boolean): string {
  if (v > 0) return fmtStat(v, ru);
  if (v < 0) return `${ru ? "прибавилось" : "grew by"} ${fmtStat(-v, ru)}`;
  return "0";
}

export function fmtWhen(ms: number | string, ru: boolean): string {
  return new Date(ms).toLocaleString(loc(ru), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const fmtPct = (p: number, ru: boolean): string =>
  `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toLocaleString(loc(ru), { maximumFractionDigits: 1 })} %`;
