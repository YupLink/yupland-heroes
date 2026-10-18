// Экономика «как на ладони» — общие типы клиента и сервера.
//
// Задача владельца (22.09.2026): видеть движения и лазейки — кто что купил,
// где и почём, кому продал; у кого какая дельта/навар за период; движение
// по каждому ресурсу, включая энергию. Данные берутся из леджеров (acc_ledger,
// res_ledger, ticket_ledger, currency_ledger, like_*_log) и нового журнала
// сделок trade_journal, который пишут точки торговли с момента выката.
// ИИ-советник и рычаги — отдельно, позже.

/** Окно отчёта: ISO-даты, сервер зажимает до ECON_MAX_DAYS. */
export type EconRange = { from: string; to: string };
export const ECON_MAX_DAYS = 92;

/**
 * Валюта в отчётах — общий словарь для всех леджеров:
 * токены счёта ('Darai', 'GJ', 'USDT', …), ресурсы ('gold', 'wood', 'stone',
 * 'diamonds'), 'tickets', 'likes', 'Energy'.
 */
export type EconCurrency = string;

/** Группы движений — леджерные kind'ы сведены к понятным админу. */
export type EconKindGroup =
  | "reward" // награды (боссы, сундуки, рейд, дропы)
  | "mine" // шахты и поля
  | "trade_buy" // купил у маркета/города/игрока
  | "trade_sell" // продал маркету/городу/игроку
  | "sink" // ворота, порталы, постройки, заклинания, бусты — деньги никому
  | "deposit" // ввод извне (кошелёк, звёзды, паки)
  | "withdraw" // вывод наружу
  | "gift" // подарки/начисления админа
  | "energy_regen"
  | "energy_decay"
  | "energy_spend"
  | "other";

export type KindAmount = { kind: string; group: EconKindGroup; amount: number; n: number };

/** Дельта одного игрока по одной валюте за окно. */
export type DeltaRow = {
  accountId: string;
  displayName: string;
  telegramUsername: string | null;
  currency: EconCurrency;
  earned: number;
  spent: number;
  net: number;
  byKind: KindAmount[];
  /** Сделок в trade_journal за окно (в этой валюте цены). */
  trades: number;
  /** Навар: Σ продал − Σ купил по trade_journal в этой валюте; null — сделок нет. */
  margin: number | null;
};

export type DeltaReport = {
  range: EconRange;
  currencies: EconCurrency[];
  rows: DeltaRow[];
  /** Отчёт обрезан лимитом строк. */
  truncated: boolean;
};

/** Движение одного ресурса по дням: приход/расход и разрез по видам. */
export type ResourceDay = {
  day: string;
  plus: number;
  minus: number;
  byKind: Record<string, number>;
};

export type ResourceReport = {
  range: EconRange;
  currency: EconCurrency;
  days: ResourceDay[];
  /** Откуда приходит (kind → сумма, число строк), по убыванию. */
  sources: KindAmount[];
  /** Куда уходит. */
  sinks: KindAmount[];
  topPlus: DeltaRow[];
  topMinus: DeltaRow[];
  /** Сколько сейчас у игроков суммарно (если известно), иначе null. */
  supplyNow: number | null;
};

/** Одна строка ленты игрока — из любого леджера или журнала сделок. */
export type FeedRow = {
  at: string;
  ledger: "acc" | "res" | "ticket" | "energy" | "likes" | "trade";
  currency: EconCurrency;
  delta: number;
  kind: string;
  group: EconKindGroup;
  ref: string | null;
  place: { mapId: string; q: number; r: number } | null;
  /** Человеческая подпись: «купил 12 × Молоко у маркета (28,45) по 40 gold». */
  note: string | null;
};

export type FeedReport = {
  accountId: string;
  displayName: string;
  range: EconRange;
  rows: FeedRow[];
  /** Курсор для следующей страницы (ISO at последней строки) или null. */
  nextCursor: string | null;
};

// ─── Журнал сделок ───
export type TradeSource =
  | "market" // купил у маркета-постройки
  | "market_sell" // продал маркету/ломбарду
  | "town" // сделка с ратушей (buy/sell по side)
  | "chip_market" // рынок фишек, игрок ↔ игрок
  | "wh_take" // взял с общей полки склада
  | "wh_put" // положил на общую полку (руками или переливом с поля)
  | "gate" // плата за ворота
  | "portal" // плата за портал
  | "tour" // плата за запись на турнир (Арена; цену ставит админ)
  | "field" // урожай поля: в личные ячейки склада (take) или на общую полку (put)
  | "chest" // магический сундук: положил в сеть (put; чужой — контрагент хозяин) / забрал из своей (take)
  | "chest_plunder" // грабёж сундука: владелец потерял (pay), грабитель унёс (take)
  | "loot_bag" // мешочек на карте: забрал (take; контрагент — чья добыча выпала) / положил (put)
  | "plain_chest" // обычный сундук (общий): положил (put) / забрал (take), без контрагента
  | "mystic" // приз мистического бокса (товар/ресурс): «купил» за 'box' без цены — не добыча
  | "fish" // улов удочкой: в рюкзак (take) / не влез — мешочком у рыбака (put)
  | "drink"; // выпил/съел товар-буст из рюкзака (use)

export type TradeSide = "buy" | "sell" | "take" | "put" | "pay" | "use";

export type TradeRow = {
  id: number;
  at: string;
  accountId: string;
  displayName: string;
  /** Вторая сторона: account_id игрока, либо 'shop' | 'town' | 'sink', либо null. */
  counterparty: string | null;
  counterpartyName: string | null;
  mapId: string | null;
  q: number | null;
  r: number | null;
  source: TradeSource;
  side: TradeSide;
  /** Ключ товара как в admin-economy-keys (res:gold, custom:<id>, chip:<id>, pack:<id>…). */
  itemKey: string;
  itemName: string;
  qty: number;
  priceUnit: number | null;
  priceCur: EconCurrency | null;
  total: number | null;
  ref: string | null;
};

/** Цепочка «купил → продал» одного игрока по одному товару за окно. */
export type ChainLeg = {
  qty: number;
  total: number;
  cur: EconCurrency | null;
  places: Array<{
    mapId: string | null;
    q: number | null;
    r: number | null;
    n: number;
    counterparty: string | null;
  }>;
};

export type ChainRow = {
  accountId: string;
  displayName: string;
  itemKey: string;
  itemName: string;
  buys: ChainLeg;
  sells: ChainLeg;
  /** Σ продал − Σ купил, если валюта одна; иначе null. */
  margin: number | null;
  marginCur: EconCurrency | null;
  first: string;
  last: string;
};

export type TradesReport = {
  range: EconRange;
  rows: TradeRow[];
  chains: ChainRow[];
  nextCursor: string | null;
};

// ─── Лазейки ───
export type LoopholeKind =
  | "arbitrage" // купил дёшево в одном месте, продал дорого в другом
  | "shelf_taker" // берёт с общих полок больше, чем кладёт
  | "energy_outlier" // живёт на подарках: энергии от админа кратно больше регена, покупок и наград
  | "reward_heavy"; // почти весь приход — награды/подарки, трат нет

export type LoopholeRow = {
  kind: LoopholeKind;
  accountId: string;
  displayName: string;
  /** Чем больше — тем подозрительнее; сортировка по нему. */
  score: number;
  summary: string;
  details: Record<string, number | string>;
};

export type LoopholesReport = { range: EconRange; rows: LoopholeRow[] };

/** Причины трат энергии — суточный агрегат energy_spend_daily. */
export type EnergySpendReason =
  | "step"
  | "fight"
  | "boss"
  | "portal"
  | "gate"
  | "ship"
  | "tower"
  | "mine_capture"
  | "market"
  | "build"
  | "spell"
  | "stake"
  | "pickup"
  | "decor"
  | "bag_open" // открыть мешочек (§8.23)
  | "chest_open" // открыть сундук — обычный или магический (§8.23)
  | "dig" // закопать или выкопать мешочек/сундук (§8.23)
  | "tour" // энергия в цене записи на турнир (§8.27)
  | "other";
