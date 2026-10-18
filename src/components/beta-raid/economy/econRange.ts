// Окно отчёта для новых вкладок Экономики — чистая арифметика без React,
// чтобы её можно было проверить тестом. Хук useEconRange держит состояние,
// здесь — только «из выбора → EconRange {from, to}».
//
// Почему пресеты считаются на клиенте: старым вкладкам сервер по-прежнему
// получает period ('24h'|'7d'|'30d'), а новым — конкретные ISO-даты.
// Одно и то же окно в двух форматах, но источник времени один — момент
// нажатия кнопки, а не каждый рендер (иначе ключ react-query менялся бы
// без конца и отчёт перезапрашивался бы каждый кадр).
import { ECON_MAX_DAYS, type EconRange } from "@/lib/econ/types";
import type { EconomyPeriod } from "@/server/api/beta-raid/admin-economy-types";

export type EconMode = EconomyPeriod | "custom";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const PRESET_DAYS: Record<EconomyPeriod, number> = { "24h": 1, "7d": 7, "30d": 30 };

/**
 * Пресет → окно. «to» округляется вверх до минуты: ключ запроса стабилен
 * в пределах минуты, а свежие строки в окно попадают.
 */
export function presetRange(preset: EconomyPeriod, now: number): EconRange {
  const to = Math.ceil(now / MINUTE_MS) * MINUTE_MS;
  const from = to - PRESET_DAYS[preset] * DAY_MS;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

/** Локальная дата в формате date-input (YYYY-MM-DD). */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Что подставить в date-input по умолчанию: последняя неделя по сегодня. */
export function defaultCustomDays(now: number): { from: string; to: string } {
  return { from: dayKey(new Date(now - 7 * DAY_MS)), to: dayKey(new Date(now)) };
}

/**
 * Пара дней из date-input → окно: с начала первого дня по конец второго
 * (локальное время админа). Перепутанный порядок — переворачиваем, окно
 * длиннее ECON_MAX_DAYS — подрезаем начало (сервер всё равно зажмёт, но
 * пусть админ видит честные даты). Пустые/битые поля → null.
 */
export function customRange(fromDay: string, toDay: string): EconRange | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || !/^\d{4}-\d{2}-\d{2}$/.test(toDay)) {
    return null;
  }
  let a = new Date(`${fromDay}T00:00:00`).getTime();
  let b = new Date(`${toDay}T23:59:59.999`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a > b) {
    const swappedA = new Date(`${toDay}T00:00:00`).getTime();
    const swappedB = new Date(`${fromDay}T23:59:59.999`).getTime();
    a = swappedA;
    b = swappedB;
  }
  if (b - a > ECON_MAX_DAYS * DAY_MS) a = b - ECON_MAX_DAYS * DAY_MS;
  return { from: new Date(a).toISOString(), to: new Date(b).toISOString() };
}
