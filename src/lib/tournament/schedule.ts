// Расписание турнира (владелец, 04.10.2026): время начала и конца — по UTC,
// «без плюсов-минусов». Задано начало — автостарт в этот момент и автоконец;
// не задано — старт кнопкой, конец через N дней. Проверка общая для сервера
// (adminTourSave) и формы админки — ключами tour.err.*.
import { TOUR_MAX_DAYS } from "./types";

const DAY_MS = 86_400_000;

/** ISO-строка → мс; пусто — null; мусор — NaN (ошибка tour.err.time). */
export function parseUtc(v: string | null | undefined): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  return Date.parse(s);
}

/**
 * Ошибка расписания или null. keepStartMs — начало, уже сохранённое у этого
 * черновика: его можно оставить и в прошлом (автостарт не прошёл — например,
 * не хватило пула, — админ правит призы, не трогая время).
 */
export function scheduleError(o: {
  startMs: number | null;
  endMs: number | null;
  nowMs: number;
  keepStartMs?: number | null;
}): string | null {
  const { startMs, endMs } = o;
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return "tour.err.time";
  if (endMs != null && startMs == null) return "tour.err.end_no_start";
  if (startMs == null) return null;
  if (startMs <= o.nowMs && startMs !== o.keepStartMs) return "tour.err.start_past";
  if (endMs == null) return null;
  if (endMs <= startMs) return "tour.err.end_before_start";
  if (endMs - startMs > TOUR_MAX_DAYS * DAY_MS) return "tour.err.days";
  return null;
}
