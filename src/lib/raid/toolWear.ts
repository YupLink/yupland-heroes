// Прочность инструмента (владелец, 28.09): «Износ за удар, %» у своего товара.
//
// Пусто — инструмент ломается с первого удара, как было («1 топор = 1 декор»).
// Задано, например 25, — у инструмента прочность 100 %, каждая рубка −25 %;
// дошла до нуля или ниже — штука сломалась, из стопки ушла 1 шт., следующая
// начинает со 100 % (остаток удара на неё не переходит: при 30 % штука живёт
// четыре удара, 100 → 70 → 40 → 10 → сломана).
//
// Прочность живёт у СТОПКИ в рюкзаке героя: raid_hero_backpack.wear — сколько
// процентов уже снято с текущей штуки (0 — все целые). SQL удара и отката —
// server/api/beta-raid/tool-wear.ts, та же арифметика, что здесь.
//
// «Починить» переносом нельзя. Склад (14.10.2026) берёт стопку вместе с
// износом — он едет с ней туда и обратно (server/api/beta-raid/tool-wear-move.ts).
// Продажа, маркет, оплата и выброс забирают только целые штуки, а база
// не даёт опустить стопку с износом ниже одной штуки (CHECK, миграция
// decor-03-tool-wear). Значит, у торговца или у другого игрока изношенной
// штуки не окажется, и вернуться оттуда со 100 % ей неоткуда.
// Уйти она может только сломавшись или вместе со всей стопкой при «Выбросить
// всё» — это уничтожение, а не починка.

/** Износ за удар: целое 1…100; пусто, ноль и мусор — null («ломается сразу»). */
export function toolWearOf(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Math.round(Number(String(v).trim().replace(",", ".")));
  return Number.isFinite(n) && n >= 1 ? Math.min(100, n) : null;
}

/** Сколько процентов снимает удар: без настройки — вся штука. */
export const wearStep = (wear: unknown): number => toolWearOf(wear) ?? 100;

/** Прочность текущей штуки стопки, %: снято 25 — осталось 75. */
export const durabilityOf = (wear: unknown): number =>
  Math.max(0, Math.min(100, 100 - (Number(wear) || 0)));

export type ToolStack = { count: number; wear: number };

/**
 * Удар по стопке: что с ней станет и сколько прочности снято (taken — для
 * отката). null — целой штуки нет, рубить нечем.
 */
export function hitStack(
  s: ToolStack,
  step: number,
): (ToolStack & { taken: number; broke: boolean }) | null {
  if (!(s.count >= 1)) return null;
  const broke = s.wear + step >= 100;
  return {
    count: broke ? s.count - 1 : s.count,
    wear: broke ? 0 : s.wear + step,
    taken: Math.min(step, 100 - s.wear),
    broke,
  };
}

/**
 * k ударов подряд одним расчётом — то же, что k раз hitStack (рыбалка: поимка =
 * удар удочкой, §8.35). hits — сколько ударов стопка выдержала (целых штук
 * могло не хватить на все k), broken — сколько штук сломалось. SQL — та же
 * арифметика (fishing/fishing-catch-sql.ts).
 */
export function hitStackTimes(
  s: ToolStack,
  step: number,
  k: number,
): ToolStack & { hits: number; broken: number } {
  const whole = Math.floor(s.count);
  if (whole < 1 || !(k >= 1)) return { count: s.count, wear: s.wear, hits: 0, broken: 0 };
  const per = Math.ceil(100 / step);
  const first = Math.max(1, Math.ceil((100 - s.wear) / step));
  const hits = Math.min(Math.floor(k), first + (whole - 1) * per);
  if (hits < first) return { count: s.count, wear: s.wear + hits * step, hits, broken: 0 };
  const broken = 1 + Math.floor((hits - first) / per);
  const count = s.count - broken;
  return { count, wear: count >= 1 ? ((hits - first) % per) * step : 0, hits, broken };
}

/**
 * Сколько ударов стопка выдержит ВСЕГО: начатая штука доживает свои, целые
 * дают по ceil(100/шаг). Нужна рыбалке: «4 удочки и пятая наполовину» — это
 * ровно 45 забросов, и ползунок дальше не пускает (владелец, 06.10.2026).
 */
export function stackUses(s: ToolStack, step: number): number {
  const whole = Math.floor(s.count);
  if (whole < 1 || !(step > 0)) return 0;
  const per = Math.ceil(100 / step);
  const first = Math.max(1, Math.ceil((100 - (Number(s.wear) || 0)) / step));
  return first + (whole - 1) * per;
}

/** Откат удара: вернуть снятое; ушло «через ноль» — штука возвращается в стопку. */
export function undoHit(s: ToolStack, taken: number): ToolStack {
  const wear = s.wear - taken;
  return wear < 0 ? { count: s.count + 1, wear: wear + 100 } : { count: s.count, wear };
}

/** Сколько штук можно унести из стопки: изношенная остаётся в рюкзаке. */
export const movableCount = (s: ToolStack): number => Math.max(0, s.count - (s.wear > 0 ? 1 : 0));

/**
 * «N использований» рядом с «Износ за удар, %» в админке (владелец, 29.09).
 * Штука ломается на том ударе, где износ дошёл до 100 %, а остаток удара на
 * следующую не переносится, поэтому ударов ровно ceil(100 / износ): при 30 % —
 * четыре, при 25 % — четыре, при 100 % и пустом поле — один.
 */
export const toolUsesOf = (wear: unknown): number => Math.max(1, Math.ceil(100 / wearStep(wear)));

/** «использование / использования / использований» по числу. */
export function usesWord(n: number): string {
  const [d, h] = [n % 10, n % 100];
  if (d === 1 && h !== 11) return "использование";
  if (d >= 2 && d <= 4 && (h < 10 || h >= 20)) return "использования";
  return "использований";
}
