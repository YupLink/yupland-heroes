// Генератор письма о турнирах — чистая часть окна TourLetterGen: какие турниры
// отмечены сразу, сколько письмо показывать и что уходит в черновик письма.
import { plannedEnd } from "@/components/admin/tournaments/tourSchedule";
import { buildTourLetter, type TourLetterSource, type TourLetterSourceRow } from "@/lib/tourLetter";

/** Сразу отмечены все запланированные: письмо — о тех, что скоро начнутся. */
export const defaultPicked = (rows: readonly TourLetterSourceRow[]): Set<string> =>
  new Set(rows.filter((r) => r.status === "draft").map((r) => r.id));

/**
 * Самый поздний конец выбранных (у запланированного без конца — начало + дни,
 * как считает автостарт): после него письмо о турнирах уже никому не нужно.
 */
export function latestEnd(rows: readonly TourLetterSourceRow[]): string | null {
  let best: number | null = null;
  for (const r of rows) {
    const end = plannedEnd(r.startAt, r.endAt, r.days);
    const ms = end ? Date.parse(end) : NaN;
    if (Number.isFinite(ms) && (best == null || ms > best)) best = ms;
  }
  return best == null ? null : new Date(best).toISOString();
}

/** Что генератор отдаёт черновику письма (letterDraft.draftFromGenerated). */
export type GeneratedTourLetter = {
  title: string;
  body: string;
  titleEn: string;
  bodyEn: string;
  showUntil: string | null;
};

/** Письмо по отмеченным турнирам в порядке списка — сразу ru и en. */
export function generateTourLetter(
  src: TourLetterSource,
  picked: ReadonlySet<string>,
  series: string,
): GeneratedTourLetter {
  const tours = src.tours.filter((r) => picked.has(r.id));
  const input = { series: series.trim() || null, tournaments: tours, arenas: src.arenas };
  const ru = buildTourLetter(input, "ru");
  const en = buildTourLetter(input, "en");
  return {
    title: ru.title,
    body: ru.body,
    titleEn: en.title,
    bodyEn: en.body,
    showUntil: latestEnd(tours),
  };
}
