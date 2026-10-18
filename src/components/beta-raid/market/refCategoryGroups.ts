// Свои товары в пикере — группами по категориям (владелец, 04.10.2026): 71 товар
// одной кучей не найти. Чистая функция отдельно от попапа — её проверяет тест,
// а MarketRefPicker не растёт сверх лимита ≤250 строк.
import {
  allCategories,
  categoryIdOf,
  groupByCategory,
  type ItemCategory,
} from "@/lib/itemCategories";
import type { Ref } from "./refPickerSources";

export type RefGroup = { cat: ItemCategory; items: Ref[] };

export type RefCategoryView = {
  /** Все категории для чипов (пустые чипы скроет CategoryChips по counts). */
  cats: ItemCategory[];
  /** Сколько товаров текущего списка в каждой категории. */
  counts: Map<string, number>;
  /** Отметки фильтра без тех, чьи категории опустели. */
  selected: string[];
  /** Что рисовать; null — справочник ещё не пришёл, сетка без групп. */
  groups: RefGroup[] | null;
};

export function refCategoryView(
  list: Ref[],
  custom: ItemCategory[] | undefined,
  selected: string[],
): RefCategoryView {
  // Без справочника все товары с категорией на миг свалились бы в «без
  // категории» (неизвестный id уходит туда) — лучше подождать плоской сеткой.
  if (!custom) return { cats: [], counts: new Map(), selected: [], groups: null };
  const cats = allCategories(custom);
  const all = groupByCategory(list, (r) => categoryIdOf("custom", r.categoryId), cats);
  const counts = new Map(all.map((g) => [g.cat.id, g.items.length]));
  // Отмеченная категория могла опустеть (удалили, товары переложили) — её чип
  // пропал, снять отметку нечем, и список стоял бы пустым. Такие не считаем.
  const live = selected.filter((id) => counts.has(id));
  const groups = live.length ? all.filter((g) => live.includes(g.cat.id)) : all;
  return { cats, counts, selected: live, groups };
}
