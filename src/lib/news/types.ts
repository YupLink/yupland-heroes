// Сводка для новостей (владелец, 29.10.2026): общие цифры игроков за период,
// лидеры и короткий список обновлений. Отдаёт её /api/news (по ключу) и
// вкладка «Новости» панели «$ Экономика». Админы в цифры не входят.
import type { TourBand, TourMetric } from "@/lib/tournament/types";

export type NewsLang = "ru" | "en";

/** Окно сводки — в днях: 1 = сегодня, 7 = неделя (по UTC, с начала дня). */
export const NEWS_DAY_OPTIONS = [1, 7, 30] as const;
export const NEWS_MAX_DAYS = 30;

/** Доски «сейчас на руках» — от периода не зависят. */
export const WEALTH_BOARDS = ["gold", "diamonds", "darai", "wood", "stone"] as const;
/** Доски «за период» — по журналам действий (server/api/news/news-sql). */
export const ACTIVITY_BOARDS = ["steps", "energy", "fights", "gathered", "mines"] as const;

export type WealthBoard = (typeof WEALTH_BOARDS)[number];
export type ActivityBoard = (typeof ACTIVITY_BOARDS)[number];
export type NewsBoard = WealthBoard | ActivityBoard;

/** portrait — картинка героя игрока (только у первых богачей по золоту). */
export type NewsLeader = { name: string; value: number; portrait?: string };

export type NewsTotals = {
  /** Играли за период: что-то сделали (журнал трат энергии). */
  active: number;
  /** Новые аккаунты за период. */
  newPlayers: number;
  steps: number;
  energy: number;
  /** Бои с объектами карты и победы в них. */
  fights: number;
  wins: number;
  /** Рубка деревьев и добыча гор/камней. */
  gathered: number;
  /** Захваты шахт. */
  mines: number;
  planted: number;
  /** Клетки земли, уложенные в мире строителей. */
  land: number;
  dynamite: number;
  /** На руках у игроков сейчас. */
  gold: number;
  diamonds: number;
  darai: number;
};

/** Главная новость дня: заголовок, строка пояснения, картинки из игры. */
export type NewsDayHeadline = { title: string; lead: string; images: string[] };

export type NewsUpdateDay = { date: string; items: string[]; headline?: NewsDayHeadline };

/** Событие окна для газеты: кого чаще всех побеждали, что чаще всех рубили. */
export type NewsHighlight = { name: string; image: string | null; n: number };

/** Лидер идущего турнира: место (ничья — одно место), герой, очки. */
export type NewsTourLeader = { place: number; name: string; score: number };

/**
 * Турнир для газеты (владелец, 07.11.2026): идущий или ближайший
 * запланированный. Предложения — те же, что в письме о турнирах (tourLetter*).
 */
export type NewsTour = {
  status: "running" | "soon";
  name: string;
  metric: TourMetric;
  /** Категория словами: «Шахты во владении». */
  category: string;
  /** За что очки: «у кого больше шахт — очко в день за каждую». */
  goal: string;
  /** Начало и конец (ISO, UTC): у идущего — фактические, у запланированного — расписание. */
  startAt: string | null;
  endAt: string | null;
  /** Срок предложением: «С пятницы 7 ноября 18:00 до понедельника 10 ноября 10:00 (UTC).» */
  term: string;
  fundDarai: number;
  /** Фонд и призы предложением; bands — то же по местам для программ. */
  prizes: string;
  bands: TourBand[];
  /** Цена записи предложением: «Цена записи — 5 золота.» / «Запись бесплатная.» */
  entry: string;
  /** Записались (оплатили запись). */
  players: number;
  /** У фарма — время суточного снимка шахт, UTC («09:59»). */
  snapAt?: string;
  /** У идущего — первые места; у запланированного — пусто. */
  leaders: NewsTourLeader[];
};

/** Идущие турниры и ближайшие запланированные (все, что стартуют в ближайший момент). */
export type NewsTours = { active: NewsTour[]; soon: NewsTour[] };

export type NewsDigest = {
  days: number;
  /** Начало окна (полночь UTC) и момент сборки — ISO. */
  from: string;
  to: string;
  totals: NewsTotals;
  leaders: Record<NewsBoard, NewsLeader[]>;
  updates: NewsUpdateDay[];
  /** Для картинок и заголовка газеты в дни без обновлений. */
  highlights?: { monster?: NewsHighlight; decor?: NewsHighlight };
  /** «Что обсуждают» — пересказ чата сообщества (DeepSeek); нет — пусто. */
  discussions?: string[];
  /** Турниры сейчас — только у сводки «до сейчас» (API, вкладка), не у выпуска газеты. */
  tournaments?: NewsTours;
};

/** Период панели (ISO from/to) → дни сводки: 24 ч → 1, 7 дн → 7, шире 30 — 30. */
export function daysOfRange(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return clampNewsDays(Number.isFinite(ms) ? Math.max(1, Math.round(ms / 86_400_000)) : 7);
}

/** Окно в днях из чего угодно: целое 1…30, мусор — неделя. */
export function clampNewsDays(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 7;
  return Math.min(n, NEWS_MAX_DAYS);
}
