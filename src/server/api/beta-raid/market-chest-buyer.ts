// Магический сундук получает сделкой только Торговец (правило владельца
// 27.09.2026, шапка @/lib/magicChest). Проверка стоит на ПОЛУЧЕНИИ товара:
// покупка в маркете, выплата скупки товаром (переработка), покупка у ратуши.
// Поставить сундук на карту может кто угодно — там её нет.
//
// Ref приводим к канону так же, как выдача (stackKeyFor): позиция витрины без
// шаблона — только с именем «Магический сундук» — всё равно ляжет в рюкзак
// стеком сундука, и проверка обязана узнать её тем же путём.
import { canonStackKey, refFromStackKey } from "@/server/api/beta-raid/item-alias";
import { assertChestBuyer } from "@/server/api/beta-raid/chest/chest-item";

/** Минимум товара для проверки: вид, ссылка (или id позиции) и имя. */
export type ChestGood = {
  kind: string;
  refId?: string | null;
  id?: string | null;
  name?: string | null;
};

/**
 * Пустить к получению товара: не свой товар или не сундук — молча дальше;
 * сундук не Торговцу — chest.merchant_only (нет героя — market.need_hero).
 * Звать ДО резерва запаса и списания цены.
 */
export async function assertChestGood(wallet: string, good: ChestGood): Promise<void> {
  if (good.kind !== "custom") return;
  const key = await canonStackKey(good.kind, good.refId ?? good.id ?? null, good.name ?? null);
  await assertChestBuyer(wallet, { kind: good.kind, refId: refFromStackKey(key) });
}
