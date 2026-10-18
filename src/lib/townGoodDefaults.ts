// Товар ратуши «из коробки» (владелец, 04.10.2026): отметил галками — товары
// сразу в ратуше с ценой, расходом и производством; поправить можно потом.
//
//   • цена ×1 — почём товар уже продают лавки карты (медиана за штуку в
//     золоте); нет в лавках — медиана его категории, потом вида, потом 1;
//   • едят только «Еду»: 0,02 в день на жителя (500 жителей — 10 в сутки),
//     производство — половина расхода: вторую половину город покупает у игроков;
//   • прочее не едят: производство 1% жителей в сутки (не меньше 1), у
//     штучных (бойцы, паки, артефакты, герои) — 1 в сутки. От производства
//     считается норма склада (10 дней), и цена ×1 у неё определена.
// Склад нового товара сервер заводит ровно на норму — цена при создании ×1
// (seedTownStock), склады остальных товаров не трогаются.
import { categoryIdOf } from "./itemCategories";
import { newGoodId, type TownGood } from "./townConfig";
import type { MarketKind } from "./marketItem";

export const FOOD_CATEGORY_ID = "icat_food";
export const FOOD_PER_RESIDENT = 0.02;

const PIECE_KINDS: ReadonlySet<MarketKind> = new Set(["boss", "pack", "art", "hero"]);

export type PriceHints = { byRef: Record<string, number>; byCat: Record<string, number> };

/** Цена: до копеек, но не ноль — бесплатного товара у города не бывает. */
const money = (v: number) => Math.max(0.01, Math.round(v * 100) / 100);

export function defaultPrice(
  kind: MarketKind,
  refId: string | null,
  categoryId: string | null | undefined,
  hints: PriceHints | undefined,
): number {
  const h = hints ?? { byRef: {}, byCat: {} };
  const v =
    h.byRef[`${kind}:${refId ?? ""}`] ??
    h.byCat[categoryIdOf(kind, categoryId)] ??
    h.byCat[`kind:${kind}`] ??
    1;
  return money(v);
}

export function defaultTownGood(o: {
  kind: MarketKind;
  refId: string | null;
  token?: string | null;
  categoryId?: string | null;
  residents: number;
  hints?: PriceHints;
}): TownGood {
  const residents = Math.max(0, Math.round(o.residents));
  const food = o.kind === "custom" && o.categoryId === FOOD_CATEGORY_ID;
  const consumePerResident = food ? FOOD_PER_RESIDENT : 0;
  const producePerDay = food
    ? Math.max(1, Math.round((residents * FOOD_PER_RESIDENT) / 2))
    : PIECE_KINDS.has(o.kind)
      ? 1
      : Math.max(1, Math.round(residents * 0.01));
  return {
    id: newGoodId(),
    kind: o.kind,
    refId: o.refId,
    token: o.token ?? null,
    operation: "both",
    marketPrice: defaultPrice(o.kind, o.refId, o.categoryId, o.hints),
    consumePerResident,
    producePerDay,
  };
}
