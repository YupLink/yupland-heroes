// Список турниров в админке: раскладка по разделам и «сколько осталось».
// Чистая логика — под тест; подписи собирает компонент через t().
import type { TourAdminRow } from "@/lib/tournament/types";

export type TourSection = "draft" | "running" | "done";

/** Раздел плашки: «раздаём призы» — ещё не итог, держим среди идущих. */
export const sectionOf = (r: Pick<TourAdminRow, "status">): TourSection =>
  r.status === "draft" ? "draft" : r.status === "done" ? "done" : "running";

/**
 * Разделы по порядку: черновики, идут, завершены. Идущие — кто раньше
 * кончится, тот выше; завершённые — свежие сверху; черновики — новые сверху.
 */
export function groupTours(rows: readonly TourAdminRow[]): Record<TourSection, TourAdminRow[]> {
  const out: Record<TourSection, TourAdminRow[]> = { draft: [], running: [], done: [] };
  for (const r of rows) out[sectionOf(r)].push(r);
  const ms = (iso: string | null): number => (iso ? Date.parse(iso) || 0 : 0);
  out.draft.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  out.running.sort((a, b) => ms(a.endsAt) - ms(b.endsAt));
  out.done.sort((a, b) => ms(b.finishedAt) - ms(a.finishedAt));
  return out;
}

export type LeftParts = { d: number; h: number; m: number };

/** Сколько до конца: дни, часы, минуты. null — конца нет или уже прошёл. */
export function timeLeft(endsAt: string | null, nowMs: number): LeftParts | null {
  if (!endsAt) return null;
  const left = Date.parse(endsAt) - nowMs;
  if (!Number.isFinite(left) || left <= 0) return null;
  const min = Math.floor(left / 60_000);
  return { d: Math.floor(min / 1440), h: Math.floor((min % 1440) / 60), m: min % 60 };
}
