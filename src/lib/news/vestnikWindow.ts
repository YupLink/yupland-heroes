// Окна выпусков «Вестника героев» (владелец, 29.10.2026): день — сутки UTC,
// неделя — понедельник…воскресенье UTC. Номер выпуска считается от первого дня
// газеты — без счётчика в базе, одинаково у всех процессов.

const DAY_MS = 86_400_000;

/** Первый день газеты: выпуск за него — № 1. */
export const VESTNIK_EPOCH = "2026-10-29";

/** Час UTC выхода: 07:00 UTC = 10:00 по Москве. */
export const VESTNIK_HOUR_UTC = 7;

export type IssueKind = "day" | "week";

export type IssueWindow = {
  kind: IssueKind;
  /** Первый день окна, YYYY-MM-DD. */
  date: string;
  /** Полночь UTC начала и конца (конец не входит) — ISO. */
  from: string;
  to: string;
  /** Номер выпуска своего вида. */
  number: number;
};

const midnight = (t: number): number => {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
};

const ymd = (t: number): string => new Date(t).toISOString().slice(0, 10);

/** «2026-10-29» → полночь UTC; кривая дата — null. */
export function parseDay(s: string | null | undefined): number | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00.000Z`);
  return Number.isFinite(t) ? t : null;
}

const epoch = (): number => parseDay(VESTNIK_EPOCH) as number;

/** Выпуск дня за сутки, в которые попадает `t`. */
export function dayWindow(t: number): IssueWindow {
  const from = midnight(t);
  return {
    kind: "day",
    date: ymd(from),
    from: new Date(from).toISOString(),
    to: new Date(from + DAY_MS).toISOString(),
    number: Math.max(1, Math.round((from - epoch()) / DAY_MS) + 1),
  };
}

/** Сводка недели (пн–вс), в которую попадает `t`. */
export function weekWindow(t: number): IssueWindow {
  const day = midnight(t);
  const monday = day - ((new Date(day).getUTCDay() + 6) % 7) * DAY_MS;
  return {
    kind: "week",
    date: ymd(monday),
    from: new Date(monday).toISOString(),
    to: new Date(monday + 7 * DAY_MS).toISOString(),
    number: Math.max(1, Math.floor((monday - weekWindow0()) / (7 * DAY_MS)) + 1),
  };
}

/** Понедельник недели первого выпуска. */
function weekWindow0(): number {
  const e = epoch();
  return e - ((new Date(e).getUTCDay() + 6) % 7) * DAY_MS;
}

/** Сводка «последние 7 дней по сегодня» — по запросу админа, не по расписанию. */
export function recentWeek(now: number): IssueWindow {
  const today = midnight(now);
  const from = today - 6 * DAY_MS;
  return {
    kind: "week",
    date: ymd(from),
    from: new Date(from).toISOString(),
    to: new Date(today + DAY_MS).toISOString(),
    number: weekWindow(now).number,
  };
}

/**
 * Что пора выпустить в момент `now`: после часа выхода — газета за вчера, а по
 * понедельникам ещё и сводка за прошлую неделю. До часа выхода — ничего; дни
 * раньше первого выпуска газеты — тоже.
 */
export function dueIssues(now: number): IssueWindow[] {
  if (new Date(now).getUTCHours() < VESTNIK_HOUR_UTC) return [];
  const out: IssueWindow[] = [];
  const day = dayWindow(now - DAY_MS);
  if (day.date >= VESTNIK_EPOCH) out.push(day);
  const week = weekWindow(now - DAY_MS);
  if (new Date(now).getUTCDay() === 1 && week.to > `${VESTNIK_EPOCH}T00:00:00.000Z`) out.push(week);
  return out;
}

/** Ключ выпуска — для отметки «отправлен» и промокода. */
export const issueKey = (w: IssueWindow): string => `${w.kind}_${w.date}`;

/** Вариант «Сгенерировать заново» из адреса: целое 0…99, мусор — 0. */
export function parseVariant(v: string | null | undefined): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 99) : 0;
}
