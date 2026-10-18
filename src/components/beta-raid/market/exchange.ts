// Что игрок ОТДАЁТ и что ПОЛУЧИТ по позиции витрины — одним списком строк
// «картинка + количество + имя».
//
// ПОЧЕМУ отдельный модуль. Плитка писала цену родовым словом («2 товар и 1
// тов…»): имени шаблона у клиента не было, а пускать в подпись его id нельзя —
// игрок читал бы «1 артефакт art_GMihRMHltI». Сервер теперь отдаёт имя и
// картинку самого шаблона цены/выплаты (priceName/priceImage), и сборка нужна
// обеим витринам сразу: в покупке цена — это то, что отдают, в скупке те же
// поля означают выплату. Формула одна на оба конца, иначе стороны разъедутся
// первой же правкой.
//
// Имена читаем через фолбэк на словарное слово: витрина лежит у игрока в
// суточном persist-кэше, и снимок со старой сборки приходит без новых полей —
// плитка обязана пережить это, а не остаться с пустой подписью.
import type { MarketItemView } from "@/lib/buildingEffect";
import { starsForDarai } from "@/lib/starsForDarai";
import type { MarketPriceResource } from "@/lib/marketItem";
import { marketResourceIconSrc } from "@/lib/resourceIcons";
import { artAnyIconSrc, artAnyRarity } from "./artAnyIcon";

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Строка обмена: сколько, чего и чем это нарисовать. */
export type ExchangeEntry = {
  amount: number;
  /** Подпись игроку: имя шаблона, словарное имя ресурса или символ токена. */
  label: string;
  image: string | null;
  /** Пиксель-арт ресурса — рисуется чётко (pixelated) и мельче настоящего арта. */
  pixel: boolean;
};

/** Одна цена/выплата строкой обмена. */
function priceEntry(
  t: Translate,
  amount: number,
  resource: MarketPriceResource,
  token: string | null,
  name: string | null | undefined,
  image: string | null | undefined,
): ExchangeEntry {
  // Токен — сам себе имя, картинки у него нет. Звездочнику без DARAI — в звёздах.
  if (resource === "token") {
    const stars = token === "Darai" ? starsForDarai(amount) : null;
    if (stars != null) return { amount: stars, label: "★", image: null, pixel: false };
    return { amount, label: token ?? t("market.res.token"), image: null, pixel: false };
  }
  // «Любой артефакт редкости X» — не шаблон, а редкость: имя из словаря,
  // картинка ломбарда.
  const anyArt = artAnyRarity(token);
  if (anyArt)
    return {
      amount,
      label: t(`market.art_any.${anyArt}`),
      image: artAnyIconSrc(token),
      pixel: false,
    };
  const icon = marketResourceIconSrc(resource);
  if (icon) return { amount, label: t(`market.res.${resource}`), image: icon, pixel: true };
  // Билеты (картинки нет) и предметные цены. У предметной имя и картинка
  // шаблона приходят с сервера; пока не приехали — родовое слово словаря,
  // как было. Врать id шаблона по-прежнему не станем.
  return { amount, label: name || t(`market.res.${resource}`), image: image ?? null, pixel: false };
}

/** Цена позиции: первая всегда, вторая — если админ задал «алхимию». */
export function priceEntries(t: Translate, it: MarketItemView): ExchangeEntry[] {
  const list = [
    priceEntry(t, it.priceAmount, it.priceResource, it.priceToken, it.priceName, it.priceImage),
  ];
  if (it.price2Resource && it.price2Amount)
    list.push(
      priceEntry(
        t,
        it.price2Amount,
        it.price2Resource,
        it.price2Token,
        it.price2Name,
        it.price2Image,
      ),
    );
  return list;
}

/** Сам товар позиции строкой обмена — то, ради чего плитка стоит на витрине. */
export function goodEntry(it: MarketItemView): ExchangeEntry {
  if (it.kind === "resource") {
    const icon = marketResourceIconSrc(it.refId);
    // У токен-товара админ пишет имя своими словами, а символ игрок узнаёт
    // только по приписке — дублировать её, если она уже в имени, не нужно.
    const label =
      it.refId === "token" && it.giveToken && !it.name.includes(it.giveToken)
        ? `${it.name} ${it.giveToken}`
        : it.name;
    return {
      amount: it.giveAmount,
      label,
      image: it.image ?? icon,
      pixel: !it.image && icon != null,
    };
  }
  return {
    amount: it.giveAmount,
    label: it.name,
    image: it.image ?? artAnyIconSrc(it.refId),
    pixel: false,
  };
}

/** Имена шаблонов обеих цен — для сводки корзины, где картинок нет. */
export function priceNames(it: MarketItemView): { first: string | null; second: string | null } {
  // Через ?? не для типа, а ради снимка витрины из суточного persist-кэша:
  // сделанный до этой правки, он приходит вообще без полей.
  return { first: it.priceName ?? null, second: it.price2Name ?? null };
}
