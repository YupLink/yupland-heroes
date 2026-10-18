// Общие типы админ-панели «$ Экономика». Живут отдельно, чтобы и сервер,
// и клиент импортировали одно и то же (правило ≤250 строк — экономика
// разложена по вкладкам, а типы у всех общие).

export type EconomyPeriod = "24h" | "7d" | "30d";

/** Один товар в сводке: где живёт и сколько сейчас/движется. */
export type GoodRow = {
  /** Стабильный ключ агрегации внутри отчёта. */
  key: string;
  /** Тип: resource/pack/hero/art/boss/custom. */
  kind: string;
  /** Иконка (marketResourceIconSrc для ресурсов, image шаблона у остальных). */
  image: string | null;
  name: string;
  /** Символ токена (для kind='resource' с refId='token'). */
  token: string | null;
  /** Есть сейчас — сумма по всем игрокам (счёт + рюкзак + склад + город). */
  onHand: number;
  /** Производится за сутки (поле × 24 × yield + producePerDay городов). */
  producePerDay: number;
  /** Куплено игроками в маркетах + городах за выбранный период. */
  salesUnits: number;
  /** Куплено ГОРОДАМИ у игроков за выбранный период. */
  townBuysUnits: number;
  /** Где встречается — координаты клеток (маркеты, города, поля, склады). */
  places: PlaceRow[];
};

export type PlaceRow = {
  q: number;
  r: number;
  /** market / town / warehouse / field — как показать в списке. */
  source: "market" | "town" | "warehouse" | "field";
  /** Сторона витрины у market (buy/sell), у остальных не задано. */
  side?: "buy" | "sell";
  /** Цена за штуку (у market/town), null у warehouse/field. */
  price?: number | null;
  /** Символ ресурса цены (u market/town). */
  priceResource?: string | null;
  /** Токен цены (если priceResource='token'). */
  priceToken?: string | null;
  /** Остаток на витрине (для market) или на складе. */
  remaining?: number | null;
  /** Название клетки (город/склад/маркет). Опционально. */
  label?: string;
};

/** Одна валюта/ресурс/кастом-товар у игрока. */
export type PlayerBalance = {
  currency: string;
  amount: number;
};

export type PlayerRow = {
  accountId: string;
  /** @username Telegram; если пусто — 'tg{telegram_id}' или 'acc:<id>'. */
  displayName: string;
  telegramId: number | null;
  telegramUsername: string | null;
  balances: PlayerBalance[];
  /** Последняя активность (max created_at в acc_ledger за 30д). */
  lastActive: string | null;
};

export type TownGoodLine = {
  goodId: string;
  name: string;
  image: string | null;
  consumePerDay: number;
  producePerDay: number;
  stock: number;
  norm: number;
};

export type TownRow = {
  q: number;
  r: number;
  name: string;
  residents: number;
  goods: TownGoodLine[];
};

export type PriceExtreme = {
  itemId: string;
  q: number;
  r: number;
  price: number;
  priceResource: string;
  priceToken: string | null;
  remaining: number | null;
  side: "buy" | "sell";
};

/** Товар для выпадающего списка «Дёшево / Дорого». */
export type PriceGood = {
  key: string;
  name: string;
  image: string | null;
  kind: string;
  /** Редкость (для kind='art' и pack/hero, если задана). Показывает бейдж. */
  rarity: string | null;
};

export type EconomyOverview = {
  period: EconomyPeriod;
  updatedAt: string;
  goods: GoodRow[];
  players: PlayerRow[];
  /** Все валюты/ресурсы/кастомы, которые встречаются у игроков. */
  currencies: Array<{ key: string; label: string; image: string | null }>;
  towns: TownRow[];
  priceGoods: PriceGood[];
};
