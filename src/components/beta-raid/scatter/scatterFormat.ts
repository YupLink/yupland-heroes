// Как показываем числа в панели раздачи.
//
// Отдельным файлом от компонентов — как restoreFormat у соседнего окна: иначе
// быстрая перезагрузка правок отваливается на весь файл (react-refresh).

/** 12000 → «12 000»: пятизначные суммы иначе не прочитать с телефона. */
export function fmtNum(n: number, digits = 0): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(n);
}
