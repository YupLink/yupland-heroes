// Разбор списка «кошелёк + количество» для пакетных раздач в админке.
// Один разбор на всех вкладках (мистик-боксы, артефакты, герои) — чтобы
// формат вставки не разъезжался и админу не приходилось помнить два.
//
// Формат строки: `wallet.near 3` — разделитель пробел/запятая/точка с
// запятой/таб. Количество можно не писать — тогда 1.

export type GrantTarget = { wallet: string; count: number };

/** Верхняя граница на одну строку — защита от опечатки «10000». */
export const GRANT_COUNT_MAX = 500;

/** Число из поля ввода → безопасное количество (1…500). */
export function clampGrantCount(raw: string | number): number {
  const n = typeof raw === "number" ? raw : parseInt(raw, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(GRANT_COUNT_MAX, Math.trunc(n)));
}

/** Одна строка вставленного списка → цель раздачи (или null, если мусор). */
export function parseGrantLine(line: string): GrantTarget | null {
  const s = line.trim();
  if (!s) return null;
  const withCount = s.match(/^([^\s,;\t]+)[\s,;\t]+(\d+)\s*$/);
  if (withCount) return { wallet: withCount[1].trim(), count: clampGrantCount(withCount[2]) };
  const only = s.match(/^([^\s,;\t]+)\s*$/);
  if (only) return { wallet: only[1].trim(), count: 1 };
  return null;
}

/** Весь текст из textarea → список целей (мусорные строки просто выпадают). */
export function parseGrantList(text: string): GrantTarget[] {
  return text
    .split(/\r?\n/)
    .map(parseGrantLine)
    .filter((x): x is GrantTarget => !!x);
}
