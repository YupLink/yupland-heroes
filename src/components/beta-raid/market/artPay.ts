// Что игрок ОТДАЁТ артефактами по позиции витрины — редкость и сколько штук
// уходит за одну единицу сделки.
//
// ПОЧЕМУ общий модуль, а не условие по месту. Артефакт покидает инвентарь на
// ОБЕИХ витринах, но лежит в разных полях позиции и не зеркально:
//   sell — артефакт это ТОВАР: refId='art_any_X', за единицу уходит giveAmount;
//   buy  — артефакт это ЦЕНА: priceResource='art', priceToken='art_any_X',
//          за единицу уходит priceAmount.
// Читают это три места сразу — плитка (потолок «+» и пикер), корзина (гард
// «пока не выбран — сделку не пускать») и обрезка набранного при смене выбора.
// Разойдись они в формуле — сервер отказал бы уже после нажатия кнопки.
import type { MarketItemView } from "@/lib/buildingEffect";
import { artAnyRarity, type ArtRarity } from "./artAnyIcon";

/** Редкость отдаваемого артефакта и его расход на единицу сделки. */
export type ArtPayNeed = { rarity: ArtRarity; perUnit: number };

/**
 * Нужен ли игроку выбор конкретного артефакта по этой позиции.
 *
 * null — артефакт тут ни при чём (обычный товар за золото) ЛИБО позиция
 * именная: у неё шаблон задан админом, и выбирать нечего.
 */
export function artPayNeed(it: MarketItemView): ArtPayNeed | null {
  if (it.side === "sell") {
    const rarity = artAnyRarity(it.refId);
    return rarity ? { rarity, perUnit: it.giveAmount } : null;
  }
  if (it.priceResource !== "art") return null;
  const rarity = artAnyRarity(it.priceToken);
  return rarity ? { rarity, perUnit: it.priceAmount } : null;
}

/**
 * Потолок количества по выбранному артефакту.
 *
 * Одна единица сделки съедает perUnit штук: при perUnit=2 три свободных дают
 * только одну единицу, а не три. Без деления игрок набирал бы три, сервер
 * просил шесть и отказывал.
 */
export function artPickMax(it: MarketItemView, count: number): number {
  const need = artPayNeed(it);
  return need ? Math.floor(count / Math.max(1, need.perUnit)) : count;
}
