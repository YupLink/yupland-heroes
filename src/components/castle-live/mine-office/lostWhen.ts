// Когда случилась потеря в «Отбитых» (§8.106).
import { tr, type Lang } from "../mine-buildings/presentation";

/** «сегодня 14:05», «вчера 22:10», иначе «2 нояб., 10:00». */
export function lostWhen(at: number, l: Lang, now = Date.now()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString(l, { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date(now)) - day(d)) / 86_400_000);
  if (diff === 0) return tr(l, `сегодня ${time}`, `today ${time}`);
  if (diff === 1) return tr(l, `вчера ${time}`, `yesterday ${time}`);
  return d.toLocaleString(l, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
