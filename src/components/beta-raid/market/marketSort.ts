// Порядок товаров на витрине: дешёвое в начале, дорогое вглубь.
//
// ПОЧЕМУ сортируем на клиенте. У позиций один pos=0, дальше сервер отдаёт их по
// времени создания — витрина выглядела случайной кучей, и владелец не мог
// глазом найти нужную ступень («обычный арт», «редкий арт»). Порядок нужен
// предсказуемый, но менять серверную выборку ради вида — не то место.
//
// ПОЧЕМУ ключ — «что игрок ОТДАЁТ», а не всегда цена. У витрин это разные поля:
// в покупке игрок расстаётся с ценой, в скупке — с самим товаром. Одно правило
// на обе стороны держит порядок совпадающим с тем, что игрок читает на плитке
// жёлтым: сверху дешёвая сделка, ниже дорогая.
//
// Суммы в разных валютах несравнимы («1 золото» против «5 дерева»), поэтому
// сначала группируем по валюте (порядок MARKET_PRICE_RESOURCES: валюты, потом
// предметные виды), внутри валюты — по редкости и шаблону, и только потом по
// сумме. Хвостом id: без него равные позиции переставлялись бы при каждом
// обновлении витрины.
import type { MarketItemView } from "@/lib/buildingEffect";
import { MARKET_PRICE_RESOURCES, type MarketPriceResource } from "@/lib/marketItem";
import { artAnyRarity, type ArtRarity } from "./artAnyIcon";
import { goodAsPrice } from "./cartCost";

const RES_ORDER = new Map<MarketPriceResource, number>(
  MARKET_PRICE_RESOURCES.map((r, i) => [r, i]),
);

/** Редкость псевдо-артефакта — сама по себе шкала «дешевле → дороже». */
const RARITY_ORDER: Record<ArtRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

type Part = { res: number; rarity: number; token: string; amount: number };

function part(resource: MarketPriceResource, token: string | null, amount: number): Part {
  const rar = artAnyRarity(token);
  return {
    res: RES_ORDER.get(resource) ?? RES_ORDER.size,
    // Именованные шаблоны шкалы редкости не имеют — уводим их за псевдо-арты.
    rarity: rar ? RARITY_ORDER[rar] : RARITY_ORDER.legendary + 1,
    token: token ?? "",
    amount,
  };
}

function cmpPart(a: Part, b: Part): number {
  if (a.res !== b.res) return a.res - b.res;
  if (a.rarity !== b.rarity) return a.rarity - b.rarity;
  if (a.token !== b.token) return a.token < b.token ? -1 : 1;
  return a.amount - b.amount;
}

/** Главная сумма и необязательная добавка («алхимия» / вторая выплата). */
type Pair = { first: Part; second: Part | null };

/** Обе цены позиции одной парой. */
function priceParts(it: MarketItemView): Pair {
  return {
    first: part(it.priceResource, it.priceToken, it.priceAmount),
    second:
      it.price2Resource && it.price2Amount
        ? part(it.price2Resource, it.price2Token, it.price2Amount)
        : null,
  };
}

/** Чем игрок расплачивается по позиции: цена (покупка) или товар (скупка). */
function giveParts(it: MarketItemView): Pair {
  if (it.side === "sell") {
    const g = goodAsPrice(it);
    return { first: part(g.resource, g.token, it.giveAmount), second: null };
  }
  return priceParts(it);
}

/**
 * Что игрок ПОЛУЧИТ — только для скупки. На покупке это сам товар, и сравнивать
 * его незачем: там уже сравнили цену, а разные товары за одну цену выстраивать
 * по алфавиту их шаблонов смысла не больше, чем по id.
 */
function getParts(it: MarketItemView): Pair | null {
  return it.side === "sell" ? priceParts(it) : null;
}

/** Сравнение пары: сначала главная сумма, потом добавка. */
function cmpPair(a: Pair, b: Pair): number {
  const c = cmpPart(a.first, b.first);
  if (c !== 0) return c;
  // Вторая цена делает сделку строго дороже — позиция без неё идёт выше.
  if (!a.second !== !b.second) return a.second ? 1 : -1;
  if (a.second && b.second) return cmpPart(a.second, b.second);
  return 0;
}

/** Новый массив позиций в порядке «дешёвое → дорогое». Исходный не трогаем. */
export function sortMarketItems(items: MarketItemView[]): MarketItemView[] {
  return [...items].sort((a, b) => {
    const c = cmpPair(giveParts(a), giveParts(b));
    if (c !== 0) return c;
    // На скупке отдают почти всегда одну штуку, и ключ «что отдаёшь» у соседних
    // позиций совпадает целиком — дальше порядок задавал id, то есть случай.
    // Тай-брейк по ВЫПЛАТЕ возвращает смысл «дешёвое → дорогое» и этой витрине:
    // сначала скромные сделки, ниже щедрые.
    const ga = getParts(a);
    const gb = getParts(b);
    if (ga && gb) {
      const c2 = cmpPair(ga, gb);
      if (c2 !== 0) return c2;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
