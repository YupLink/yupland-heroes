// Выделение в пикере «Какой артефакт отдать» — чистые функции без React, чтобы
// MarketArtPick держался ≤250 строк, а правила выбора проверялись тестом.
//
// Строка пикера — группа: шаблон И износ (сломанный и целый одного шаблона —
// разные строки). В ломбарде (multi) отмечают несколько групп, как героев
// (владелец, 25.10.2026): тап включает группу целиком (все свободные) и выключает её, сколько
// штук из группы — степпер до «свободно N». Порядок — порядок отметок: убавит
// игрок степпер на витрине — уйдут первые отмеченные (artPay.pickPayload).
// Без multi (лавка города, оплата артефактом) — одна группа целиком, как было.
import type { ArtChoice } from "./MarketArtPick";

/** Что пикеру нужно знать о строке списка (listSellableArtifacts). */
export type PickRow = { templateId: string; name: string; count: number; wear: number };

/** Отмеченные группы в порядке тапов и сколько штук из каждой. */
export type Sel<T extends PickRow> = Array<{ a: T; n: number }>;

/** Одна строка пикера — шаблон И прочность. */
export const sameGroup = (
  a: { templateId: string; wear?: number },
  b: { templateId: string; wear?: number },
): boolean => a.templateId === b.templateId && (a.wear ?? 0) === (b.wear ?? 0);

/** Тап по группе: без multi — выбрать её целиком, с multi — включить целиком (лишнее — степпером) или снять. */
export function tapSel<T extends PickRow>(sel: Sel<T>, a: T, multi: boolean): Sel<T> {
  if (!multi) return [{ a, n: a.count }];
  return sel.some((s) => sameGroup(s.a, a))
    ? sel.filter((s) => !sameGroup(s.a, a))
    : [...sel, { a, n: a.count }];
}

/** Степпер группы: ноль — снять отметку, сверху — не больше свободных. */
export function setSelN<T extends PickRow>(sel: Sel<T>, a: T, n: number): Sel<T> {
  if (n <= 0) return sel.filter((s) => !sameGroup(s.a, a));
  return sel.map((s) => (sameGroup(s.a, a) ? { a: s.a, n: Math.min(n, s.a.count) } : s));
}

export const selTotal = (sel: Sel<PickRow>): number => sel.reduce((s, x) => s + x.n, 0);

/**
 * Открыли пикер снова — отмечено прежнее, если ещё свободно (число — не больше
 * свободных сейчас, порядок — прежний). Пропавшая группа просто не отмечается.
 */
export function selFromChoice<T extends PickRow>(
  list: T[],
  value: ArtChoice | null,
  multi: boolean,
): Sel<T> {
  if (!value) return [];
  if (!multi || !value.arts) {
    const a = list.find((x) => sameGroup(x, value));
    return a ? [{ a, n: a.count }] : [];
  }
  return value.arts.flatMap((g) => {
    const a = list.find((x) => sameGroup(x, g));
    return a ? [{ a, n: Math.min(g.count, a.count) }] : [];
  });
}

/**
 * Выбор в ArtChoice. Без multi — как раньше: шаблон, count = свободных (потолок
 * степпера на витрине), износ группы. С multi — count = отмечено штук, arts —
 * группы по порядку; подпись — имя одной группы или «Артефактов: N» (many).
 */
export function choiceOf(
  sel: Sel<PickRow>,
  multi: boolean,
  many: (n: number) => string,
): ArtChoice | null {
  const first = sel[0];
  if (!first) return null;
  if (!multi)
    return {
      templateId: first.a.templateId,
      name: first.a.name,
      count: first.a.count,
      ...(first.a.wear ? { wear: first.a.wear } : {}),
    };
  return {
    templateId: first.a.templateId,
    name: sel.length === 1 ? first.a.name : many(selTotal(sel)),
    count: selTotal(sel),
    arts: sel.map((s) => ({ templateId: s.a.templateId, wear: s.a.wear, count: s.n })),
  };
}
