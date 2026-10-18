// Категории товаров (владелец, 04.10.2026): чтобы в ратуше и в выборе товара не
// было «бардака, всё вместе». У своих товаров категория — запись справочника
// (raid_item_category), её создают и переименовывают. Товары других видов
// категорию берут по виду: бойцы — «Воины», паки — «Паки» и т. д. — заводить для
// них справочник незачем, вид уже и есть категория.
import type { MarketKind } from "./marketItem";

export type ItemCategory = {
  id: string;
  name: string;
  pos: number;
  /** Сколько своих товаров в категории (у категорий по виду — не считается). */
  count?: number;
};

/** Свой товар без категории — отдельной группой, чтобы его было видно. */
export const NO_CATEGORY: ItemCategory = { id: "none", name: "Без категории", pos: 900 };

/** Категории по виду товара — постоянные, их не создают и не удаляют. */
export const KIND_CATEGORIES: Record<Exclude<MarketKind, "custom">, ItemCategory> = {
  resource: { id: "kind:resource", name: "Ресурсы", pos: 1000 },
  boss: { id: "kind:boss", name: "Воины", pos: 1010 },
  pack: { id: "kind:pack", name: "Паки", pos: 1020 },
  art: { id: "kind:art", name: "Артефакты", pos: 1030 },
  hero: { id: "kind:hero", name: "Герои", pos: 1040 },
};

/** Категория товара: у своего — из справочника (или «без категории»), у прочих — по виду. */
export function categoryIdOf(kind: MarketKind, categoryId: string | null | undefined): string {
  if (kind === "custom") return categoryId || NO_CATEGORY.id;
  return KIND_CATEGORIES[kind].id;
}

/** Всё, что показывать чипами: свои категории по порядку, «без категории», виды. */
export function allCategories(custom: ItemCategory[]): ItemCategory[] {
  const own = [...custom].sort((a, b) => a.pos - b.pos || a.name.localeCompare(b.name, "ru"));
  return [...own, NO_CATEGORY, ...Object.values(KIND_CATEGORIES)];
}

/**
 * Разложить список по категориям в их порядке; пустые группы не возвращаются.
 * Порядок внутри группы — как в исходном списке. Ссылка на неизвестную
 * категорию (только что удалили) — в «без категории», а не в никуда.
 */
export function groupByCategory<T>(
  items: T[],
  catOf: (item: T) => string,
  cats: ItemCategory[],
): Array<{ cat: ItemCategory; items: T[] }> {
  const known = new Set(cats.map((c) => c.id));
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const raw = catOf(it);
    const id = known.has(raw) ? raw : NO_CATEGORY.id;
    const list = buckets.get(id);
    if (list) list.push(it);
    else buckets.set(id, [it]);
  }
  const out: Array<{ cat: ItemCategory; items: T[] }> = [];
  for (const cat of cats) {
    const list = buckets.get(cat.id);
    if (list?.length) out.push({ cat, items: list });
  }
  return out;
}
