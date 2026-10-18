// Шансы видов рыбы внутри улова (владелец, 06.10.2026).
//
// Шанс поимки (10 % на заброс) решает, клюнуло ли ВООБЩЕ. Эти 10 % и есть те
// 100 %, которые делят между собой виды рыбы: 90 / 7 / 2,5 / 0,5. Сумма всегда
// ровно 100 — поэтому доли плавающие: поднял одному виду, остальные ужались
// пропорционально своим прежним долям; добавил вид — потеснились все.
//
// Точность — десятые доли процента: 0,5 % владелец задаёт прямо, а мельче не
// просил. Бросок идёт в промилле (0…999), чтобы 2,5 % значили ровно 25 шансов
// из тысячи, а не «примерно».
export type FishItem = { id: string; pct: number };

/** Шаг хранения: 0,1 %. В промилле — целые, без дробной арифметики. */
const MILLE = 1000;
export const FISH_PCT_MIN = 0.1;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Проценты держим с одним знаком: 2,5 — да, 2,55 — нет. */
export const round1 = (n: number): number => Math.round((Number(n) || 0) * 10) / 10;

const milleOf = (pct: number): number => Math.round((Number(pct) || 0) * 10);

/**
 * Привести доли к сумме ровно 100 %. Пустой список — пустой; все нули — поровну.
 * Остаток от округления уходит самому крупному виду: он его и не заметит.
 */
export function normalizeFish(items: readonly FishItem[]): FishItem[] {
  const list = items.filter((it) => it && typeof it.id === "string" && it.id.length > 0);
  if (list.length === 0) return [];
  const raw = list.map((it) => Math.max(0, milleOf(it.pct)));
  const sum = raw.reduce((a, b) => a + b, 0);
  // Ни у кого нет доли (новый список, битая настройка) — делим поровну.
  const base = sum > 0 ? raw.map((v) => Math.floor((v * MILLE) / sum)) : even(list.length);
  let left = MILLE - base.reduce((a, b) => a + b, 0);
  // Остаток раздаём по одной десятой, начиная с самых крупных: так 1/3 даёт
  // 33,4 / 33,3 / 33,3, а не 33,3 / 33,3 / 33,3 и потерянную десятую.
  const order = base.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  for (let i = 0; left > 0; i = (i + 1) % order.length, left--) base[order[i][1]] += 1;
  return list.map((it, i) => ({ id: it.id, pct: round1(base[i] / 10) }));
}

/** Поровну на n видов — в промилле, без остатка (его раздаст normalizeFish). */
function even(n: number): number[] {
  return Array.from({ length: n }, () => Math.floor(MILLE / n));
}

/**
 * Поставить виду долю; остальные делят остаток ПРОПОРЦИОНАЛЬНО прежним долям.
 * Единственный вид всегда 100 %: делить не с кем.
 */
export function setFishPct(items: readonly FishItem[], id: string, pct: number): FishItem[] {
  const list = normalizeFish(items);
  if (!list.some((it) => it.id === id)) return list;
  if (list.length === 1) return [{ id, pct: 100 }];
  const own = clamp(milleOf(pct), 0, MILLE);
  const rest = list.filter((it) => it.id !== id);
  const restSum = rest.reduce((a, it) => a + milleOf(it.pct), 0);
  const share = MILLE - own;
  const next = list.map((it) => {
    if (it.id === id) return { id, pct: round1(own / 10) };
    // Все остальные были по нулям — делим остаток между ними поровну.
    const part = restSum > 0 ? (milleOf(it.pct) * share) / restSum : share / rest.length;
    return { id: it.id, pct: round1(part / 10) };
  });
  return normalizeFish(next);
}

/** Добавить вид: ему равная доля, остальные ужимаются пропорционально. */
export function withFishItem(items: readonly FishItem[], id: string): FishItem[] {
  const list = normalizeFish(items);
  if (list.some((it) => it.id === id)) return list;
  if (list.length === 0) return [{ id, pct: 100 }];
  return setFishPct([...list, { id, pct: 0 }], id, round1(100 / (list.length + 1)));
}

/** Убрать вид: его доля расходится остальным пропорционально. */
export function withoutFishItem(items: readonly FishItem[], id: string): FishItem[] {
  return normalizeFish(normalizeFish(items).filter((it) => it.id !== id));
}

/**
 * Кто клюнул при броске 0…999 (промилле). Виды идут по порядку списка, каждый
 * занимает свой отрезок — поэтому один и тот же бросок всегда даёт тот же вид.
 */
export function pickFish(items: readonly FishItem[], roll: number): string | null {
  const list = normalizeFish(items);
  if (list.length === 0) return null;
  const r = ((Math.floor(roll) % MILLE) + MILLE) % MILLE;
  let acc = 0;
  for (const it of list) {
    acc += milleOf(it.pct);
    if (r < acc) return it.id;
  }
  return list[list.length - 1].id;
}

/** Подпись доли: «90 %», «2,5 %» — без лишнего нуля после запятой. */
export const pctText = (pct: number, lang: "ru" | "en" = "ru"): string => {
  const n = round1(pct);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", lang === "ru" ? "," : ".");
  return `${s} %`;
};
