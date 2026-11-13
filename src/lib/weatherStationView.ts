// Окно «Метеостанция»: как показать цифры прогноза. Проценты — целыми,
// температура — «+10°», «0°», «−10°», до смены — «2:05:09» / «5:09».

/** Шанс в % → целое для показа. */
export const stationPct = (p: number): number => Math.round(p);

/** Температура со знаком (минус — типографский, как у панели погоды). */
export function stationTemp(c: number): string {
  return `${c > 0 ? "+" : c < 0 ? "−" : ""}${Math.abs(c)}°`;
}

/** Сколько осталось до смены: «ч:мм:сс», меньше часа — «м:сс»; прошло — «0:00». */
export function stationLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
