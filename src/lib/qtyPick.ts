// Выбор количества в окнах рюкзака и склада: сколько выбросить, положить,
// забрать или выпить. Чистый модуль — правило одно на все окна, и тест держит
// его от «упрощений».
//
// Ввод живёт строкой (useQtyInput), а зажимается только на выходе из поля и
// при нажатии кнопки. Поле, которое зажимало число на каждой клавише, нельзя
// было очистить: стёр «1» — получил «1» обратно, дописал цифру — вышло «1x»,
// и руками набирались только 10–19 да максимум (жалоба игроков 27.09.2026).
//
// Количество бывает дробным: награды делятся дробно, и в рюкзаке лежит
// 0,000178 Газировки. Окно обязано уметь ровно столько, сколько лежит, поэтому
// нижняя граница — целая штука, только если весь стек и быстрые доли не меньше.
import { cleanNumText, parseNum } from "@/components/beta-raid/market/num";
import type { Lang } from "@/lib/store";

export type QtyBounds = {
  min: number;
  max: number;
  /** Только целые штуки: зелья пьют штуками. */
  integer: boolean;
  /** Быстрые доли («Ячейку», «Всё») — их значения берутся точными. */
  presets: number[];
};

/** Границы поля: сверху — сколько есть, снизу — штука или меньшая из долей. */
export function qtyBounds(
  max: number,
  opts: { integer?: boolean; presets?: readonly number[] } = {},
): QtyBounds {
  const integer = !!opts.integer;
  // Целым полям потолок — целая часть: «+» с 7 при 7,9 штуках не должен дать 7,9.
  const raw = Math.max(0, Number.isFinite(max) ? max : 0);
  const top = integer ? Math.floor(raw) : raw;
  const presets = (opts.presets ?? []).filter((p) => p > 0 && p <= top);
  const min = integer ? Math.min(1, top) : Math.min(1, top, ...presets);
  return { min, max: top, integer, presets };
}

/** Зажать в границы; мусор — к нижней. */
export function clampQty(v: number, b: QtyBounds): number {
  const n = b.integer ? Math.trunc(v) : v;
  if (!Number.isFinite(n)) return b.min;
  return Math.min(b.max, Math.max(b.min, n));
}

/** −/+ шагают целыми: с 7,74 «−» ведёт на 7, «+» — на 8 или на всё, если меньше. */
export function stepQty(v: number, dir: 1 | -1, b: QtyBounds): number {
  return clampQty(dir < 0 ? Math.ceil(v) - 1 : Math.floor(v) + 1, b);
}

/**
 * Количество языком игрока. Три знака после запятой, как у маркета, — но
 * дробь мельче тысячной показываем тремя значащими цифрами: иначе 0,000178
 * печаталось бы нулём, и «Выбросим 0 шт.» врало бы.
 *
 * digits — знаков после запятой. Счётчику «N/20» на плитке хватает двух: у
 * него ширина до корзины, и «7,738/20» на телефоне уходило под неё. Мельче
 * сотой там — те же три значащие цифры.
 */
export function qtyText(n: number, lang: Lang, digits = 3): string {
  const locale = lang === "en" ? "en-US" : "ru-RU";
  const tiny = n !== 0 && Math.abs(n) < 10 ** -digits;
  return n.toLocaleString(
    locale,
    tiny
      ? { maximumSignificantDigits: 3, useGrouping: false }
      : { maximumFractionDigits: digits, useGrouping: false },
  );
}

/**
 * Разобрать набранное. Пусто или мусор — прежнее число: стёр и ушёл из поля —
 * число вернулось. Запятая и точка — обе разделители (андроид пишет запятую).
 *
 * Набранное, которое на экране не отличить от быстрой доли, — это она, точно:
 * «7,738» при стеке 7,7380832… иначе оставляло бы хвост 0,0000832, который
 * занимает целую ячейку, а «Ячейку» ячейку бы не освободило.
 */
export function commitQty(text: string, prev: number, b: QtyBounds, lang: Lang): number {
  const v = parseNum(cleanNumText(text, { integer: b.integer }));
  if (v == null) return clampQty(prev, b);
  const n = clampQty(v, b);
  const shown = qtyText(n, lang);
  return b.presets.find((p) => qtyText(p, lang) === shown) ?? n;
}
