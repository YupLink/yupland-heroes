// Вид отдаваемого товара и форма выплаты для скупки — вынесено из
// market-sell.ts (правило ≤250 строк): там остался сам тракт сделки, здесь —
// чистые преобразования MarketItem без обращений к базе.
import type { MarketItem, MarketKind, MarketPriceResource } from "@/lib/marketItem";

/** Предметные виды выплаты — те, что живут шаблоном, а не числом на счету. */
export const ITEM_PAY = (r: MarketPriceResource): boolean =>
  r === "pack" || r === "hero" || r === "art" || r === "boss" || r === "custom";
/** Из этих выплата ложится в рюкзак героя — место проверяем заранее.
 *  Артефакт сюда не входит: он штучный и падает в инвентарь, поэтому полный
 *  рюкзак не должен мешать магазину расплатиться артефактом. */
export const TO_BACKPACK = (r: MarketPriceResource): boolean => r === "boss" || r === "custom";
/** Пак, герой и артефакт выдаются штуками — дробную выплату ими выдать нечем.
 *  Артефакт попал сюда вместе с переездом в инвентарь: пол-строки не бывает, и
 *  без этой проверки «0,5 артефакта» тихо выдавало бы ноль. */
export const WHOLE_ONLY = (r: MarketPriceResource): boolean =>
  r === "pack" || r === "hero" || r === "art";

/**
 * Вид отдаваемого товара под spend: у kind='resource' сам ресурс лежит в refId
 * (gold/token/…), символ токена — в giveToken. У предметных типов (pack/hero/
 * art/boss/custom) «ресурс» — это kind, а «символ» — refId (id шаблона). Те же
 * две пары, что понимает spend().
 */
export function goodAsPrice(item: {
  kind: MarketItem["kind"];
  refId: string | null;
  giveToken: string | null;
}): { res: MarketPriceResource; token: string | null } {
  if (item.kind === "resource") {
    return {
      res: (item.refId ?? "gold") as MarketPriceResource,
      token: item.refId === "token" ? item.giveToken : null,
    };
  }
  return { res: item.kind as MarketPriceResource, token: item.refId };
}

/**
 * Выплата как «товар» для deliverGood: giveAmount=1, а всё количество едет в
 * qty — так одна формула обслуживает и ресурс (1×N на счёт), и паки/героев
 * (N штук), и рюкзачные предметы (N единиц стека).
 */
export function payoutAsGood(
  item: MarketItem,
  res: MarketPriceResource,
  token: string | null,
  meta: { name: string; image: string | null } | null,
): MarketItem {
  const isItem = ITEM_PAY(res);
  return {
    ...item,
    kind: (isItem ? res : "resource") as MarketKind,
    refId: isItem ? token : res,
    giveToken: isItem ? null : token,
    giveAmount: 1,
    // Подпись стека — от шаблона выплаты, а не от позиции скупки.
    name: meta?.name ?? item.name,
    image: meta?.image ?? null,
  };
}
