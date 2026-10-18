// Товар маркета глазами покупателя — то, что окно постройки рисует на плитке.
//
// Вынесен из buildingEffect.types.ts: тот упёрся в лимит ≤250 строк, а витрина
// растёт своими полями (подписи предметных цен). buildingEffect.types его
// ре-экспортит, поэтому внешние импорты `@/lib/buildingEffect` не меняются.
import type { MarketKind, MarketPriceResource, MarketSide } from "./marketItem";
import type { BoostEffect } from "./hero/boost";
import type { TownCurve } from "./townPricing";

/** Товар маркета глазами покупателя. */
export type MarketItemView = {
  id: string;
  /** Витрина, в которой стоит: покупка игроком или скупка магазином. */
  side: MarketSide;
  kind: MarketKind;
  /** Ключ ресурса у ресурсного товара (для иконки); иначе шаблон/null. */
  refId: string | null;
  name: string;
  image: string | null;
  giveAmount: number;
  /** Символ токена-товара (когда kind='resource' и refId='token'). */
  giveToken: string | null;
  priceResource: MarketPriceResource;
  priceToken: string | null;
  priceAmount: number;
  /**
   * Подпись ПРЕДМЕТНОЙ цены: имя самого шаблона (пак/герой/арт/босс/свой
   * товар), а не позиции витрины. На скупке это и есть «на что меняется»:
   * без него плитка писала безликое «1 товар» вместо «1 Слиток железа».
   *
   * null во всех случаях, где имени нет или оно не нужно: цена — обычный
   * ресурс (иконку рисует клиент по priceResource), шаблон удалён, либо это
   * псевдо-шаблон «любой арт редкости X» (art_any_*) — у него подпись живёт
   * в словаре клиента сразу на двух языках, сервер прислал бы только русскую.
   */
  priceName: string | null;
  /** Картинка того же шаблона. null — клиент рисует свою иконку. */
  priceImage: string | null;
  /** Вторая цена (алхимия): платят ОБЕИМИ. null — второй цены нет. */
  price2Resource: MarketPriceResource | null;
  price2Token: string | null;
  price2Amount: number | null;
  /** Подпись/картинка шаблона второй цены — по тем же правилам, что priceName. */
  price2Name: string | null;
  price2Image: string | null;
  /** Запас: у покупки — сколько продадим, у скупки — сколько ещё примем. */
  stock: number | null;
  /** Сколько уже прошло через позицию. */
  sold: number;
  /** Остаток: null — без лимита, 0 — распродано / больше не скупаем. */
  remaining: number | null;
  /** Герой проходит фильтр магазина И остаток не исчерпан. */
  buyable: boolean;
  /** Почему нельзя (ключ причины), если не buyable. */
  lockKey: string | null;
  /**
   * Прибавки к характеристикам героя, если товар — буст. Пусто у обычных
   * товаров: о бустах, которых нет, покупателю не пишут ни слова.
   */
  boost?: BoostEffect[] | null;
  /** Свой товар с галочкой «зелье»: покупка ложится в сумку зелий. */
  potion?: boolean;
  /**
   * Лавка в городе: цена не фикс, а кривая ратуши по объёму (townPricing).
   * stock — склад города сейчас. Нет поля — обычная лавка с ценой позиции.
   */
  /** rush — особый спрос: город скупает до НЗ вдвое дороже обычного (×4). */
  town?: { stock: number; curve: TownCurve; rush?: boolean } | null;
};
