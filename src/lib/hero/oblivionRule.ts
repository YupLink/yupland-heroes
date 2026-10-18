// ЗАБВЕНИЕ: правило пары «уровень + минуты» (владелец, 28.09.2026). Одно на
// редакторы (строка ошибки, «Сохранить»), серверное сохранение и чтение из базы.
//
// | Уровень                  | Минуты         | Что даёт                                  |
// | N ≥ 1 («3», «1-3»)       | пусто          | N забвений без срока (oblivion_lv)        |
// | N ≥ 1                    | «30», «10-20»  | N забвений, пока идёт время (oblivion_lvt)|
// | «0» — ровно              | заданы         | без счёта, пока идёт время (oblivion_time)|
// | «0», пусто, мусор, «0-3» | пусто          | НЕВАЛИДНО: сохранить нельзя, выдать нечего|
//
// Бесконечно — ТОЛЬКО «0» и только со временем: пустой уровень при заданных
// минутах тоже невалиден, диапазон с нулём («0-3») — тоже.
import { parseRange } from "@/server/api/beta-raid/abilities";

/** Ключ отказа (braid-oblivion): строка под эффектом и ответ сервера на сохранение. */
export const OBLIVION_SETUP_ERR = "oblivion.need_time_or_level";

/** Заряды без срока, заряды со сроком, безлимит на время. */
export type OblivionMode = "lv" | "lvt" | "time";

const text = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";

/** Уровень: «0», «3» или диапазон с обеими границами от 1; иначе — пусто. */
export function oblivionLevelOf(v: unknown): string {
  const s = text(v);
  if (/^\d+$/.test(s)) return String(Number(s));
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(s);
  return m && Number(m[1]) >= 1 && Number(m[2]) >= 1 ? s : "";
}

/** Минуты: «30» или «10-20»; пусто, «0» и мусор — срока нет. */
export function oblivionMinutesOf(v: unknown): string {
  const s = typeof v === "number" ? String(Math.max(0, Math.round(v))) : text(v);
  return parseRange(s)[1] > 0 ? s : "";
}

/** Что даёт настройка; null — пара невалидна. */
export function oblivionMode(level: unknown, minutes: unknown): OblivionMode | null {
  const lv = oblivionLevelOf(level);
  const timed = oblivionMinutesOf(minutes) !== "";
  if (!lv) return null;
  if (lv === "0") return timed ? "time" : null;
  return timed ? "lvt" : "lv";
}

/** Вид уже выпавшего броска (уровень 0 — без счёта); null — выдавать нечего. */
export function oblivionRollMode(amount: number, minutes: number): OblivionMode | null {
  const a = Math.max(0, Math.floor(Number(amount) || 0));
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  if (m > 0) return a > 0 ? "lvt" : "time";
  return a > 0 ? "lv" : null;
}

/**
 * Эффекты из любой формы настройки: список, `{effects: [...]}` или старая
 * одиночная запись алтаря. Тот же разбор читает игра (parseBoostEffects).
 */
export function boostList(raw: unknown): unknown[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const effects = (raw as { effects?: unknown }).effects;
  return Array.isArray(effects) ? effects : [raw];
}

/** Все «Забвения» списка — с верной парой. Прочие эффекты правило не трогает. */
export function oblivionEffectsOk(raw: unknown): boolean {
  return boostList(raw).every((item) => {
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    return o?.stat !== "oblivion" || oblivionMode(o.value, o.minutes) !== null;
  });
}

/**
 * Проверка для zod-схемы тела запроса: неверная пара — отказ КЛЮЧОМ словаря.
 * Обычный refine отдал бы клиенту JSON ZodError, и админ прочёл бы в тосте
 * «[{"code":"custom",…}]» вместо «Задай время или количество использований».
 */
export function oblivionGuard<T>(ok: (v: T) => boolean): (v: T) => boolean {
  return (v) => {
    if (!ok(v)) throw new Error(OBLIVION_SETUP_ERR);
    return true;
  };
}
