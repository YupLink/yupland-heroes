// Типы маркет-постройки: товар витрины и его цена. Общие для сервера и клиента.
// Товары живут в yuplink.raid_market_item (по клетке-маркету), не в building_config.

/** Что за товар. resource → на счёт; остальное → в инвентарь купленного. */
// Фишки поштучно НЕ продаём — только паками, поэтому отдельного "chip" нет.
export type MarketKind = "resource" | "pack" | "hero" | "art" | "boss" | "custom";

/**
 * Сторона витрины. У клетки-маркета ДВА независимых списка товаров:
 *   buy  — магазин продаёт: игрок платит цену, получает товар;
 *   sell — магазин скупает: игрок отдаёт товар, получает цену.
 * Наборы разные (в этом весь смысл переключателя), настройки — одинаковые.
 */
export type MarketSide = "buy" | "sell";

export const MARKET_SIDES: MarketSide[] = ["buy", "sell"];

/**
 * Чем платят за товар — тот же максимальный набор, что и у товара:
 * все валюты игры плюс «предметные» варианты (пак, герой, артефакт, босс,
 * свой товар). Предметная цена берётся из рюкзака героя (см. resource-pay:
 * kind='item' → списание с raid_hero_backpack по stack_key).
 */
export type MarketPriceResource =
  | "token"
  | "energy"
  | "likes"
  | "tickets"
  | "gold"
  | "stone"
  | "wood"
  | "diamonds"
  | "pack"
  | "hero"
  | "art"
  | "boss"
  | "custom";

export const MARKET_KINDS: MarketKind[] = ["resource", "pack", "hero", "art", "boss", "custom"];

/** Русские подписи ресурсов для админа (в выборе валюты и ресурс-товара). */
export const RESOURCE_LABELS_RU: Record<MarketPriceResource, string> = {
  gold: "Золото",
  stone: "Камень",
  wood: "Дерево",
  diamonds: "Алмазы",
  likes: "Лайки",
  tickets: "Билеты",
  energy: "Энергия",
  token: "Токен",
  pack: "Пак",
  hero: "Герой",
  art: "Артефакт",
  boss: "Босс",
  custom: "Свой товар",
};

export const MARKET_PRICE_RESOURCES: MarketPriceResource[] = [
  "gold",
  "stone",
  "wood",
  "diamonds",
  "likes",
  "tickets",
  "energy",
  "token",
  "pack",
  "hero",
  "art",
  "boss",
  "custom",
];

/**
 * Ресурсы, которые можно давать товаром (kind='resource') — идут на счёт.
 *
 * Одинаков со списком «Чем платят»: настройки маркета симметричны, чтобы
 * админ ставил любой ресурс с любой стороны. Символ токена у товара живёт
 * в колонке give_token (raid_market_item), как price_token у цены.
 */
/**
 * Ресурсы, которые можно давать товаром (kind='resource') — идут на счёт.
 * Пак/герой/арт/босс/кастом сюда НЕ входят: у них свой kind в MARKET_KINDS,
 * там же выбор шаблона. Токен разрешён — символ живёт в give_token.
 */
export const MARKET_RESOURCE_GOODS: MarketPriceResource[] = [
  "gold",
  "stone",
  "wood",
  "diamonds",
  "likes",
  "tickets",
  "energy",
  "token",
];

export interface MarketItem {
  id: string;
  q: number;
  r: number;
  pos: number;
  /** В какой витрине стоит: покупка игрока или скупка магазином. */
  side: MarketSide;
  kind: MarketKind;
  /** Шаблон (пак/герой/арт/фишка/босс) или ключ ресурса; null у custom. */
  refId: string | null;
  /** Ресурс: сколько выдать; иначе — количество (обычно 1). */
  giveAmount: number;
  /** Символ токена для товара kind='resource' с refId='token'. Иначе null. */
  giveToken: string | null;
  name: string;
  image: string | null;
  priceResource: MarketPriceResource;
  priceToken: string | null;
  priceAmount: number;
  /** Вторая цена (алхимия): платят ОБЕИМИ. null во всех трёх — второй цены нет. */
  price2Resource: MarketPriceResource | null;
  price2Token: string | null;
  price2Amount: number | null;
  /**
   * Запас: у покупки — сколько всего продадим, у скупки — сколько всего
   * готовы принять. null — без лимита.
   */
  stock: number | null;
  /** Сколько уже прошло через товар. Остаток = stock - sold (null — безлимит). */
  sold: number;
  /** Сколько штук может купить один игрок (аккаунт) за сутки UTC. null — без лимита. */
  perAccountLimit: number | null;
  /** all — покупают все; filter — только герои нужной расы/специализации. */
  buyerMode: "all" | "filter";
  buyerRaces: string[];
  buyerSpecs: string[];
}

/** Черновик позиции для админ-формы: тот же товар, но id ещё может не быть. */
export type MarketDraft = Omit<MarketItem, "id" | "pos"> & { id?: string };

/** Черновик нового товара для админ-формы. */
export function emptyMarketItem(
  q: number,
  r: number,
  side: MarketSide = "buy",
): Omit<MarketItem, "id" | "pos"> {
  return {
    q,
    r,
    side,
    kind: "resource",
    refId: "gold",
    giveAmount: 1,
    giveToken: null,
    name: "",
    image: null,
    priceResource: "gold",
    priceToken: null,
    priceAmount: 1,
    price2Resource: null,
    price2Token: null,
    price2Amount: null,
    stock: null,
    sold: 0,
    perAccountLimit: null,
    buyerMode: "all",
    buyerRaces: [],
    buyerSpecs: [],
  };
}

// Шага количества здесь больше нет: в сделке всегда целые штуки. Дробной в
// маркете бывает ЦЕНА («1 молоко за 0,1 золота»), а не то, что кладут в
// корзину. Проверку целости держит сервер — market-qty.normalizeQty.

/**
 * Количество в сделке, приведённое к типу товара.
 *
 * Поле «Сколько» в форме есть ТОЛЬКО у ресурса: пак/герой/арт/босс/кастом
 * торгуются целыми штуками. Поэтому дробное количество, набранное для ресурса
 * (0,5 энергии), при переключении типа уезжало в артефакт невидимо — поля,
 * которым его поправить, в форме уже нет, а сервер такую позицию не продаёт
 * («Неверное количество»). Чиним молча в двух точках: при смене типа и при
 * открытии старой позиции, которую успели сломать.
 */
export function normalizeGiveAmount(kind: MarketKind, amount: number): number {
  if (kind === "resource") return amount;
  return Number.isInteger(amount) && amount > 0 ? amount : 1;
}
