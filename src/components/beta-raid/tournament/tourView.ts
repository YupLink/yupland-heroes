// Чистая логика окна турниров: «осталось N д N ч», строка статуса под
// заголовком плашки, склейка страниц таблицы («Ещё 20»), подписи мест и
// призов. Без React — проверяется tourView.test.ts.
import { parsePlaces } from "@/lib/tournament/places";
import { ruPlural } from "@/lib/tourLetterText";
import {
  TOUR_DARAI,
  TOUR_PAGE,
  type TourBand,
  type TourEntryPrice,
  type TourLeaderPage,
  type TourLeaderRow,
  type TourPlate,
  type TourPrize,
} from "@/lib/tournament/types";
import { joinView } from "./tourJoin";

/** Пока окно открыто, плашки и таблица обновляются раз в 30 с. */
export const TOUR_REFRESH_MS = 30_000;

/** Подпись ключом словаря: язык знает только окно. */
export type TourLabel = { key: string; params?: Record<string, number> };
type T = (key: string, params?: Record<string, string | number>) => string;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Сколько осталось до конца: «N д N ч», в последние сутки — «N ч N мин»,
 * в последний час — «N мин» (не меньше одной). Конец прошёл, а итогов ещё
 * нет — «подводим итоги». Нет даты конца (черновик) — null.
 */
export function tourLeftLabel(endsAt: string | null, now: number): TourLabel | null {
  if (!endsAt) return null;
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return null;
  const ms = end - now;
  if (ms <= 0) return { key: "tour.finishing" };
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  if (d > 0) return { key: "tour.left_dh", params: { d, h } };
  const m = Math.max(1, Math.floor((ms % HOUR) / MIN));
  if (h > 0) return { key: "tour.left_hm", params: { h, m } };
  return { key: "tour.left_m", params: { m } };
}

/**
 * Время на плашке: у идущего — «осталось», у остановленного или досчитываемого
 * (paying) — «подводим итоги». Завершённый подписывается датой в самом окне.
 */
export function plateLeftLabel(plate: TourPlate, now: number): TourLabel | null {
  if (plate.status === "paying") return { key: "tour.finishing" };
  if (plate.status !== "running") return null;
  return tourLeftLabel(plate.endsAt, now);
}

/**
 * Строка статуса под заголовком плашки: кнопка записи (join), «✓ Вы участвуете ·
 * место 4 · 1 830 очков» (ranked), «✓ Вы участвуете · очков пока нет»
 * (unranked) или просто «✓ Вы участвуете» (joined — прошлый, где мест не занял).
 */
export type TourStatusLine =
  | { kind: "join"; price: TourEntryPrice[] }
  | { kind: "ranked"; place: number; score: number }
  | { kind: "unranked" }
  | { kind: "joined" }
  | null;

/**
 * Что показать под заголовком. Записаться можно — кнопка (joinView). Есть
 * место (у прошлого — записанное) — место и очки. Записан без очков — «очков
 * пока нет», у прошлого — без хвоста: «пока» там уже не будет. Иначе — ничего.
 */
export function statusLine(plate: TourPlate, now: number): TourStatusLine {
  const join = joinView(plate, now);
  if (join?.kind === "join") return join;
  if (plate.myPlace != null) {
    return { kind: "ranked", place: plate.myPlace, score: plate.myScore ?? 0 };
  }
  if (!plate.joined) return null;
  return plate.status === "done" ? { kind: "joined" } : { kind: "unranked" };
}

/**
 * Ключ «{n} очко / очка / очков» (en — point / points) по числу и языку. Форма —
 * по тому числу, что на экране (shownScore, как в formatScore): 27,03 видно как
 * «27» — значит «27 очков», а не «очка».
 */
export function pointsKey(n: number, lang: string): string {
  const v = shownScore(n);
  if (lang !== "ru") return v === 1 ? "tour.points_one" : "tour.points_many";
  return ruPlural(v, "tour.points_one", "tour.points_few", "tour.points_many");
}

/** Таблица, склеенная из страниц по TOUR_PAGE. */
export type TourTableView = {
  rows: TourLeaderRow[];
  /** Моя строка, если её нет среди загруженных — её закрепляют внизу окна. */
  mine: TourLeaderRow | null;
  total: number;
  hasMore: boolean;
};

/**
 * Смещение следующей страницы или undefined — больше нечего грузить.
 * Неполная страница — тоже конец: таблица короче, чем казалось.
 */
export function nextTourOffset(pages: readonly TourLeaderPage[]): number | undefined {
  const last = pages[pages.length - 1];
  if (!last) return 0;
  const loaded = pages.length * TOUR_PAGE;
  return last.rows.length >= TOUR_PAGE && loaded < last.total ? loaded : undefined;
}

/**
 * Склейка страниц: страница i — строки с i·TOUR_PAGE (nextTourOffset), так что
 * страницы просто идут подряд в порядке сервера — места, за ними записавшиеся
 * без очков (место null; ключом место уже не служит). Моя строка — из самой
 * свежей страницы, где она пришла, и только если я не в списке.
 */
export function mergeTourPages(pages: readonly TourLeaderPage[]): TourTableView {
  const rows = pages.flatMap((p) => p.rows);
  let mine: TourLeaderRow | null = null;
  for (let i = pages.length - 1; i >= 0 && !mine; i--) mine = pages[i].mine;
  const shown = rows.some((r) => r.mine);
  return {
    rows,
    mine: shown ? null : mine,
    total: pages[pages.length - 1]?.total ?? 0,
    hasMore: pages.length > 0 && nextTourOffset(pages) !== undefined,
  };
}

/** «1», «2–3»: место одной строкой, как в админке. Мусор — как есть. */
export function placesText(raw: string): string {
  const r = parsePlaces(raw);
  if (!r) return raw;
  return r.from === r.to ? String(r.from) : `${r.from}–${r.to}`;
}

/** Строки призов по порядку мест: админ мог ввести «4-10» раньше «1». */
export function bandsByPlace(bands: readonly TourBand[]): TourBand[] {
  const from = (b: TourBand) => parsePlaces(b.places)?.from ?? Number.MAX_SAFE_INTEGER;
  return [...bands].sort((a, b) => from(a) - from(b));
}

/** Штучное пишем «×N», меру — числом: «Пак ×2», «Энергия 50». */
const COUNTABLE = new Set(["pack", "hero", "art", "item"]);

/** Имя приза: подпись админа, иначе токен/ресурс/вид подарка. */
export function prizeName(p: TourPrize, t: T): string {
  // Артефакт по редкости — на языке игрока (подпись админа русская).
  const rarity = p.kind === "art" ? /^rarity:(\w+)$/.exec(String(p.refId ?? ""))?.[1] : null;
  if (rarity) return t(`tour.art.${rarity}`);
  if (p.title) return p.title;
  if (p.kind === "token") {
    if (p.refId === TOUR_DARAI) return "DARAI";
    return p.refId || t("gifts.kind.token");
  }
  if (p.kind === "resource" && p.refId) {
    const key = `econ.cur.${p.refId}`;
    const s = t(key);
    return s === key ? p.refId : s;
  }
  return t(`gifts.kind.${p.kind}`);
}

/** Приз строкой: имя и количество. */
export function prizeText(p: TourPrize, t: T, lang: string): string {
  const n = Number(p.amount) || 0;
  const amount = COUNTABLE.has(p.kind) ? `×${n}` : formatScore(n, lang);
  return `${prizeName(p, t)} ${amount}`;
}

/**
 * Счёт, как его видно на экране: до десятых. toFixed округляет так же, как
 * Intl (по точному значению, половину — от нуля), так что подпись и форма
 * слова не разъезжаются.
 */
function shownScore(n: number): number {
  return Number((Number(n) || 0).toFixed(1));
}

/** Очки и суммы: разряды по языку, дробь (энергия) — до десятых. */
export function formatScore(n: number, lang: string): string {
  return shownScore(n).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits: 1,
  });
}
