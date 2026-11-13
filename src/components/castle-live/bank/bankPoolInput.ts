// Ввод курса пула — один и тот же в форме нового пула (BankPoolForm) и в правке
// пустого пула (BankPoolEdit): поле и разбор числа из него.

export const POOL_FIELD =
  "min-h-11 rounded-lg border border-[#94703c] bg-[#0b1726] px-2 text-[#f5ecda] outline-none focus:border-[#edc36b]";

/** Число из поля: запятая — как точка; не число или не больше нуля — NaN. */
export const parseWeight = (s: string): number => {
  const n = Number(s.replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : NaN;
};
