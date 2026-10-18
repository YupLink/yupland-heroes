// Расписание турнира в форме: «Начало» и «Конец» — по UTC (владелец, 04.10:
// «0:00 — по обычному UTC, без плюсов-минусов»). Задано начало — автостарт,
// пусто — старт кнопкой, конец через N дней. Чистая логика — под тест.
//
// Поле <input type="datetime-local"> отдаёт «2026-10-05T00:00» без пояса —
// читаем его как UTC, а не как время браузера админа.
import { TOUR_MAX_DAYS } from "@/lib/tournament/types";

const DAY = 86_400_000;
const RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** ISO с сервера → значение поля (UTC, до минут); пусто или мусор → "". */
export function utcInputOf(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16) : "";
}

/** Значение поля → ISO UTC; пусто → null; мусор (и 30 февраля) → undefined. */
export function isoOfUtcInput(raw: string): string | null | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (!RE.test(s)) return undefined;
  const full = s.length === 16 ? `${s}:00` : s;
  const ms = Date.parse(`${full}Z`);
  if (!Number.isFinite(ms)) return undefined;
  // V8 молча переводит 30.02 в 02.03 — такое поле не принимаем.
  const iso = new Date(ms).toISOString();
  return iso.slice(0, 19) === full ? iso : undefined;
}

/**
 * Дней между началом и концом (вверх, минимум 1): 05.10 00:00 → 11.10 23:52 =
 * 7. Оба заданы и верны — число, иначе null (дни берутся из поля «Дней»).
 */
export function spanDays(startRaw: string, endRaw: string): number | null {
  const a = isoOfUtcInput(startRaw);
  const b = isoOfUtcInput(endRaw);
  if (!a || !b) return null;
  const ms = Date.parse(b) - Date.parse(a);
  return ms > 0 ? Math.max(1, Math.ceil(ms / DAY)) : null;
}

/**
 * Ошибка расписания ключом tour.err.* или null. Конец без начала не
 * принимаем: без автостарта конец — «через N дней» от кнопки. nowMs не задан —
 * «начало в прошлом» не проверяется (это делает и сервер). keepRaw — начало,
 * уже сохранённое у черновика: оставить его прошлым можно (сервер — keepStartMs).
 */
export function scheduleError(
  startRaw: string,
  endRaw: string,
  nowMs?: number,
  keepRaw?: string,
): string | null {
  const a = isoOfUtcInput(startRaw);
  const b = isoOfUtcInput(endRaw);
  if (a === undefined || b === undefined) return "tour.err.time";
  if (b && !a) return "tour.err.end_no_start";
  const kept = !!a && a === isoOfUtcInput(keepRaw ?? "");
  if (a && nowMs !== undefined && Date.parse(a) <= nowMs && !kept) return "tour.err.start_past";
  if (a && b) {
    if (Date.parse(b) <= Date.parse(a)) return "tour.err.end_before_start";
    if ((spanDays(startRaw, endRaw) ?? 0) > TOUR_MAX_DAYS) return "tour.err.days";
  }
  return null;
}

/** Конец запланированного турнира: заданный или начало + дни (так считает
 *  автостарт сервера). Без начала — null. */
export function plannedEnd(
  startAt: string | null,
  endAt: string | null,
  days: number,
): string | null {
  if (endAt) return endAt;
  const ms = startAt ? Date.parse(startAt) : NaN;
  return Number.isFinite(ms) ? new Date(ms + days * DAY).toISOString() : null;
}
