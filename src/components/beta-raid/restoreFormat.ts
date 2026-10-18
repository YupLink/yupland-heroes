// Как показываем деньги в отчёте восстановления.
//
// Отдельным файлом от компонентов: иначе быстрая перезагрузка правок перестаёт
// работать для всего файла (правило react-refresh).

/** 71000 → «71 000»: длинные суммы иначе не прочитать с телефона. */
export const fmtDarai = (n: number): string => Math.round(n).toLocaleString("ru-RU");

/** У USDT дробь важна: 0,1 и 0 — разные деньги. */
export const fmtUsdt = (n: number): string =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
