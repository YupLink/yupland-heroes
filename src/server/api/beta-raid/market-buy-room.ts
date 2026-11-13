// Место в рюкзаке под покупку — предпроверка ДО запаса и денег. Вынесено из
// market-buy.ts ради лимита ≤250 строк.
//
// Цена товаром из рюкзака уходит раньше, чем товар ложится (market-buy: оплата
// → выдача), поэтому место считаем ПОСЛЕ списания (правило владельца 23.10:
// «если у меня одна ячейка, но этот ресурс я трачу — должно давать купить»).
// Сама выдача (depositToBackpack, лок bp:<герой>) идёт после списания и видит
// освободившееся честно; сорвалась — покупка вернёт обе цены.
import { resolveBackpack, assertTradeRoom, stackKeyFor } from "./market-backpack";
import { priceLines } from "@/lib/hero/backpackTrade";
import { isPlantKind, type MarketItem } from "@/lib/marketItem";

/** Товары, что падают в рюкзак героя. Артефакта здесь НЕТ: он штучный и живёт
 *  в инвентаре (user_game_item), иначе его нельзя надеть — а полный рюкзак
 *  зря запрещал бы покупку. Дерево для посадки (tree) — стопкой по шаблону. */
export const GOES_TO_BACKPACK = (kind: MarketItem["kind"]): boolean =>
  kind === "boss" ||
  kind === "custom" ||
  isPlantKind(kind) ||
  kind === "land" ||
  kind === "vein" ||
  kind === "building";

/**
 * Нет героя или товар не влезет → бросок сейчас, покупка не спишет ни монеты.
 * Лавка города (city) платит золотом по кривой ратуши, а не ценой позиции —
 * рюкзак она не трогает, и освобождать в нём нечего.
 */
export async function assertBuyRoom(
  wallet: string,
  item: MarketItem,
  qty: number,
  city: boolean,
): Promise<void> {
  if (item.kind === "recipe") return assertRecipeRoom(wallet, item, qty);
  if (!GOES_TO_BACKPACK(item.kind)) return;
  const bp = await resolveBackpack(wallet);
  if (!bp) throw new Error("market.need_hero");
  // Земля и жила — пачка: в рюкзак ложится «клеток в пачке × сколько пачек».
  const pack = item.kind === "land" || item.kind === "vein";
  const units = pack ? qty * Math.max(1, item.giveAmount || 1) : qty;
  // Постройка — стопкой своего чертежа (building:<чертёж>), не шаблона.
  const { forBackpack } = await import("./building-sale/bsale-blueprint");
  const want = [{ stackKey: await stackKeyFor(forBackpack(item)), qty: units }];
  await assertTradeRoom(bp, want, city ? [] : priceLines(item, qty));
}

/**
 * Рецепт: место под ЛЮБОЙ исход, что ложится в рюкзак, — разом и на всё qty.
 * Строже нужного, зато отказ выдачи не зависит от выпавшего: иначе полный
 * рюкзак «отбраковывал» бы предметы с возвратом цены и оставлял только ресурсы.
 */
async function assertRecipeRoom(wallet: string, item: MarketItem, qty: number): Promise<void> {
  const { parseRecipe } = await import("@/lib/marketRecipe");
  const { outcomeItem } = await import("./market-recipe");
  const outs = parseRecipe(item.outcomes).filter((o) =>
    GOES_TO_BACKPACK(o.kind as MarketItem["kind"]),
  );
  if (outs.length === 0) return;
  const bp = await resolveBackpack(wallet);
  if (!bp) throw new Error("market.need_hero");
  const need = new Map<string, number>();
  for (const o of outs) {
    const key = await stackKeyFor(outcomeItem(item, o));
    need.set(key, (need.get(key) ?? 0) + qty * o.amount);
  }
  const want = [...need].map(([stackKey, n]) => ({ stackKey, qty: n }));
  await assertTradeRoom(bp, want, priceLines(item, qty));
}
