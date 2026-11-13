// Товары в цене Архитектора (владелец, 21.10.2026: «настроить цену — даже
// товарами»). Строка — ключ стека рюкзака своего товара («custom:<id>», как
// плата товаром у портала и стройки, resource-pay) и сколько штук. Платит
// выбранный герой из рюкзака (ПРАВИЛА §8.59 п. 7).
//
// Разбор мягкий, как у цифр цены: битая строка выпадает, повтор ключа
// складывается, сверх потолков — режется. Без зависимостей: модуль читают и
// сервер, и окно.

/** Строк товаров в одной цене. */
export const ARCHITECT_GOODS_MAX = 8;
/** Потолок штук в строке — защита от опечатки в админке. */
export const ARCHITECT_GOOD_QTY_MAX = 100_000;

const KEY_RE = /^custom:[A-Za-z0-9_-]{1,80}$/;

export type ArchitectGood = { key: string; name: string; qty: number };

/** Строка товара глазами игрока: картинка и сколько у выбранного героя. */
export type ArchitectGoodView = ArchitectGood & { image: string | null; have: number };

/** Ключ стека своего товара («custom:<id>») — других в цене не бывает. */
export const isGoodKey = (k: unknown): k is string => typeof k === "string" && KEY_RE.test(k);

/** id товара справочника из ключа стека. */
export const goodId = (key: string): string => key.slice("custom:".length);

export function parseGoods(raw: unknown): ArchitectGood[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, ArchitectGood>();
  for (const g of raw) {
    const o = g && typeof g === "object" ? (g as Record<string, unknown>) : {};
    const key = typeof o.key === "string" ? o.key.trim() : "";
    const qty = Math.floor(Number(o.qty));
    if (!isGoodKey(key) || !Number.isFinite(qty) || qty < 1) continue;
    const prev = out.get(key);
    if (!prev && out.size >= ARCHITECT_GOODS_MAX) continue;
    const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 120) : key;
    out.set(key, {
      key,
      name: prev?.name ?? name,
      qty: Math.min(ARCHITECT_GOOD_QTY_MAX, (prev?.qty ?? 0) + qty),
    });
  }
  return [...out.values()];
}

/** Сколько каждого товара не хватает (только недостающие). */
export function goodsShort(
  goods: readonly ArchitectGood[],
  have: Readonly<Record<string, number>>,
): ArchitectGood[] {
  return goods
    .map((g) => ({ ...g, qty: g.qty - (Number(have[g.key]) || 0) }))
    .filter((g) => g.qty > 0);
}

/** «Доска ×3, Гвоздь ×1» — для отказа «не хватает товаров». */
export const goodsListText = (goods: readonly ArchitectGood[]): string =>
  goods.map((g) => `${g.name} ×${g.qty}`).join(", ");

/** Хватает ли товаров цены (по строкам глазами игрока). */
export const goodsOk = (goods: readonly ArchitectGoodView[] | undefined): boolean =>
  (goods ?? []).every((g) => g.have >= g.qty);
