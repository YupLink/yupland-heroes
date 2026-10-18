// Турниры — общий контракт сервера, админки и окна постройки «Турнир».
//
// Слово владельца (03.10.2026): турнир работает независимо от всего; админ
// создаёт турнир — категория (одна из списка, потом добавим), число дней (по
// умолчанию 7), места одной колонкой («1» или «2-3») и призы на каждое место —
// что угодно: DARAI, золото и любой ресурс, артефакты, боксы, энергия. Создан —
// черновик-плашка; «Запустить» фиксирует начало, конец — через N дней.
// DARAI-призы бронируются из пула карты при старте (не хватает — не стартует).
// Очки каждого турнира — своя таблица, доказуемо. Финиш — призы подарком с
// пометкой «турнир, место» (48 ч на забор; не забрали DARAI — назад в пул; место
// никто не занял — его DARAI назад в пул). Игрок смотрит таблицы только у
// постройки с поведением «Турнир»: плашки, своё место в углу, «i» — призы
// по местам; таблица по 20 с догрузкой; прошлые турниры тоже.
//
// 04.10.2026: расписание по UTC (задано начало — автостарт и автоконец, нет —
// старт кнопкой) и платная запись у Арены: очки идут только записавшимся и
// только с момента записи (ПРАВИЛА §8.27 п. 7–8). 12.10.2026: турнир рыбаков
// (п. 10) — у турнира свой список товаров (items: какие зелья).
import type { GiftKind } from "@/server/api/gifts-deliver";
import type { PortalPrice } from "@/lib/portal";

/**
 * Категории. Урон и убийства — по всем боссам; ресурсы — весь доход ресурса,
 * кроме покупок; шаги — двумя категориями (числом и потраченной энергией);
 * фарм — снимок раз в сутки: 1 балл = 1 шахта во владении на момент снимка.
 * Турнир рыбаков (владелец, 12.10.2026): улов удочкой, продажа своего улова,
 * выпитые зелья скорости — штуками.
 */
export const TOUR_METRICS = [
  "damage",
  "gold",
  "wood",
  "stone",
  "chop",
  "boss_kills",
  "steps",
  "step_energy",
  "farm",
  "fish_catch",
  "fish_sell",
  "potion_drink",
] as const;
export type TourMetric = (typeof TOUR_METRICS)[number];

export const isTourMetric = (m: string): m is TourMetric =>
  (TOUR_METRICS as readonly string[]).includes(m);

/** Ключ перевода категории: tour.metric.<metric> (ru + en в словаре). */
export const tourMetricKey = (m: TourMetric): string => `tour.metric.${m}`;

/**
 * Боевой запуск. true — «Запустить» бронирует DARAI из пула, на финише шлёт
 * призы подарком, игроки видят турнир у постройки (владелец, 04.10.2026: «мне
 * не нужны проверки, нужно, чтобы я мог запустить уже сейчас»). false —
 * проверка: очки копятся, пул и призы не трогаются, игрокам не виден.
 */
export const TOUR_LIVE = true;

export const TOUR_DEFAULT_DAYS = 7;
export const TOUR_MAX_DAYS = 90;
/**
 * Цена записи (владелец, 04.10.2026): участвует только записавшийся, каждый
 * турнир — своя запись; цену админ ставит любую (строки как у портала,
 * берутся ВСЕ разом), пусто — бесплатно; плата сгорает. По умолчанию — 5 золота.
 */
export type TourEntryPrice = PortalPrice;
export const TOUR_DEFAULT_ENTRY_PRICE: TourEntryPrice[] = [{ resource: "gold", amount: 5 }];
/** Вид строки res_ledger для платы за запись (экономика: сток) и для её отката. */
export const TOUR_FEE_KIND = "tour_fee";
export const TOUR_FEE_REFUND_KIND = "tour_fee_refund";

/** Сколько строк таблицы за раз — и догрузка тем же шагом. */
export const TOUR_PAGE = 20;
/** Символ DARAI в призах (как у наград рейда): только он бронируется из пула. */
export const TOUR_DARAI = "Darai";

/** Приз — то, что умеет подарок (gifts-deliver): вид, сколько, на что ссылается. */
export type TourPrizeKind = GiftKind;
export type TourPrize = {
  kind: TourPrizeKind;
  amount: number;
  /** token — символ; resource — gold/wood/stone/…; pack — id пака; art/item/hero — id шаблона. */
  refId?: string | null;
  /** Подпись приза для таблицы и подарка (имя пака/артефакта). */
  title?: string | null;
  image?: string | null;
};
/** Строка призов: места одним полем — «1» или «2-3» — и что на каждое место. */
export type TourBand = { places: string; prizes: TourPrize[] };

export type TourStatus = "draft" | "running" | "paying" | "done";

/** Турнир для админки. Время — ISO; null — ещё не было. */
export type TourAdminRow = {
  id: string;
  name: string;
  metric: TourMetric;
  days: number;
  status: TourStatus;
  bands: TourBand[];
  fundDarai: number;
  createdAt: string;
  startedAt: string | null;
  endsAt: string | null;
  finishedAt: string | null;
  players: number;
  /** Проверка: очки копятся, пул и призы не трогаются, игрокам не виден. */
  dry: boolean;
  /** Расписание (UTC): задано начало — автостарт; null — старт кнопкой. */
  startAt: string | null;
  /** Назначенный конец (UTC); null — через days от старта. */
  endAt: string | null;
  /** Почему автостарт не состоялся (ключ tour.err.*, например tour.err.pool); null — всё в порядке. */
  lastError: string | null;
  /** Цена записи; пусто — бесплатно. */
  entryPrice: TourEntryPrice[];
  /** Товары турнира (id своих товаров): у «Зелий скорости» — какие зелья; пусто — все со скоростью. */
  items?: string[];
};

/** Что принимает сохранение черновика (adminTourSave). */
export type TourSaveInput = {
  id?: string;
  name: string;
  metric: string;
  days: number;
  bands: TourBand[];
  startAt?: string | null;
  endAt?: string | null;
  entryPrice: TourEntryPrice[];
  items?: string[];
};

/** Плашка турнира у постройки. */
export type TourPlate = {
  id: string;
  name: string;
  metric: TourMetric;
  status: TourStatus;
  startedAt: string | null;
  endsAt: string | null;
  finishedAt: string | null;
  players: number;
  myPlace: number | null;
  myScore: number | null;
  bands: TourBand[];
  /** Назначенные начало и конец (UTC); у запланированного startedAt ещё null. */
  startAt: string | null;
  endAt: string | null;
  /** Я записан (и оплатил): только записанным идёт учёт очков. */
  joined: boolean;
  /** Цена записи; пусто — бесплатно. */
  entryPrice: TourEntryPrice[];
  /** Имена товаров турнира (у «Зелий скорости» — какие зелья засчитываются). */
  items?: string[];
};

/** Окно у Арены: идущие, запланированные (черновик со временем начала) и прошлые. */
export type TourPlates = { active: TourPlate[]; soon: TourPlate[]; past: TourPlate[] };

/** Строка таблицы. place null — записан, но очков пока нет (такие — после мест). */
export type TourLeaderRow = { place: number | null; name: string; score: number; mine: boolean };
export type TourLeaderPage = {
  rows: TourLeaderRow[];
  /** Моя строка, если я вне выданной страницы (null — не участвую или уже в rows). */
  mine: TourLeaderRow | null;
  total: number;
};

/** Очко-доказательство для админки: что засчитано, за что (ref) и когда. */
export type TourPointRow = { ref: string; qty: number; at: string };
