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
import { heroAnyRarity } from "./heroAny";
import type { ArtChoice, ArtGroupPick } from "./MarketArtPick";

/**
 * Редкость отдаваемого предмета и его расход на единицу сделки. what — что
 * выбирает игрок: артефакт (шаблон) или героя (копию) — скупка «Любой … герой»
 * ломбарда стоит только на витрине скупки.
 */
export type ArtPayNeed = { rarity: ArtRarity; perUnit: number; what: "art" | "hero" };

/**
 * Нужен ли игроку выбор конкретного артефакта по этой позиции.
 *
 * null — артефакт тут ни при чём (обычный товар за золото) ЛИБО позиция
 * именная: у неё шаблон задан админом, и выбирать нечего.
 */
export function artPayNeed(it: MarketItemView): ArtPayNeed | null {
  if (it.side === "sell") {
    const hero = it.kind === "hero" ? heroAnyRarity(it.refId) : null;
    if (hero) return { rarity: hero, perUnit: it.giveAmount, what: "hero" };
    const rarity = artAnyRarity(it.refId);
    return rarity ? { rarity, perUnit: it.giveAmount, what: "art" } : null;
  }
  if (it.priceResource !== "art") return null;
  const rarity = artAnyRarity(it.priceToken);
  return rarity ? { rarity, perUnit: it.priceAmount, what: "art" } : null;
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

/**
 * Первые n штук отмеченных групп (порядок — порядок отметок): последняя
 * попавшая группа урезается до остатка, следующие не едут вовсе.
 */
export function firstArts(arts: ArtGroupPick[], n: number): ArtGroupPick[] {
  const out: ArtGroupPick[] = [];
  let left = n;
  for (const g of arts) {
    if (left <= 0) break;
    const count = Math.min(g.count, left);
    if (count > 0) out.push({ ...g, count });
    left -= count;
  }
  return out;
}

/**
 * Выбор игрока в запрос сделки (pick в sellMarketItem/buyMarketItem).
 *
 * Героев и артефактов ломбарда уходит ровно столько, сколько их в корзине
 * (единица × perUnit): убавил игрок степпер ниже отмеченного — уходят первые
 * отмеченные, а не «какие-нибудь» по решению сервера. Износ едет только не
 * нулевой: понимает его лишь скупка ломбарда, и что принять, всё равно решает
 * сервер (market-sell-input.sellSpendPick).
 */
export function pickPayload(
  it: MarketItemView,
  pick: ArtChoice,
  qty: number,
): { templateId: string; heroItemIds?: string[]; arts?: ArtGroupPick[]; wear?: number } {
  const n = qty * Math.max(1, artPayNeed(it)?.perUnit ?? 1);
  const heroes = pick.heroItemIds?.slice(0, n);
  const arts = pick.arts ? firstArts(pick.arts, n) : undefined;
  return {
    templateId: pick.templateId,
    ...(heroes?.length ? { heroItemIds: heroes } : {}),
    ...(arts?.length ? { arts } : {}),
    ...(pick.wear ? { wear: pick.wear } : {}),
  };
}
