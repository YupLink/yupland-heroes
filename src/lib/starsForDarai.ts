// Цена в DARAI глазами звездочника (владелец, 07.10.2026): если DARAI на счёте
// не хватает — показываем ту же цену в звёздах (сервер и спишет звёзды,
// currency/darai-stars-pay.ts). Полноценному игроку — всегда DARAI.
//
// Состояние модуля, а не контекст: цены рисуют чистые функции в десятке окон
// (portalPriceText, priceLabel, entryPriceLine, маркет). Ставит его хук
// useStarsForDarai на экране карты; на сервере не ставится — там всегда DARAI.
type Fn = (darai: number) => number | null;
const none: Fn = () => null;
let current: Fn = none;

export function setStarsForDarai(fn: Fn | null): void {
  current = fn ?? none;
}

/** Сколько звёзд показать вместо `darai` DARAI; null — показывать DARAI. */
export function starsForDarai(darai: number): number | null {
  try {
    return current(darai);
  } catch {
    return null;
  }
}
