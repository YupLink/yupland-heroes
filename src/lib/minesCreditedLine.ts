// Итог «Собрать со всех шахт» строкой для тоста: «30 дерево · 2 золото».
// Ключ — ресурс, символ монеты или имя товара (server mine-claim-core); у
// незнакомого ключа перевода нет — показываем как есть. Общее для «Добычи»
// и «Управления шахтами».
type T = (key: string, params?: Record<string, string | number>) => string;

export function minesCreditedLine(t: T, credited: Record<string, number>): string {
  return Object.entries(credited)
    .map(([k, n]) => {
      const translated = t(`mine.res.${k}`);
      return `${n} ${translated === `mine.res.${k}` ? k : translated}`;
    })
    .join(" · ");
}
