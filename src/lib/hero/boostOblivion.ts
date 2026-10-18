// ЗАБВЕНИЕ — эффект, с которым заклинание можно забыть прямо из книги героя.
//
// Правило владельца (28.09.2026) — пара «уровень + минуты», oblivionRule.ts:
//   • уровень N без минут — «Забвение N Lv»: N забвений без срока, каждое −1,
//     на нуле эффект снят; получения складываются (3 Lv + 2 Lv = 5);
//   • уровень N и минуты — «Забвение N Lv на 30 мин»: N забвений, но только
//     пока идёт время; истекло — остаток сгорает; повтор складывает заряды и
//     продлевает срок (общее правило эффектов);
//   • уровень «0» и минуты — «Забвение на 30 мин»: без счёта, пока идёт время;
//   • «0» или пусто без минут — невалидно: не сохраняется и не выдаётся.
// Тратится по порядку: безлимит (не тратит ничего) → заряд со сроком → вечный.
// Источники — зелье/товар, заклинание, алтарь и постройка «Забвение»: все одним
// видом эффекта в общем списке (BoostEffect, stat "oblivion").
//
// Хранится на АККАУНТЕ в beta_raid_player_effects, по строке на вид:
// oblivion_lv (value — заряды, срок «навсегда»), oblivion_lvt (value — заряды,
// срок — до какого часа) и oblivion_time (value 1, срок — до какого часа).
// Запись и трата — server/api/beta-raid/oblivion*.
import { parseRange } from "@/server/api/beta-raid/abilities";
import { dict as fxDict } from "@/lib/translations/braid-boost-fx";
import { oblivionLevelOf, oblivionMinutesOf, oblivionMode } from "./oblivionRule";
import type { BoostEffect, BoostRoll } from "./boost";

export const OBLIVION_LV_KIND = "oblivion_lv";
export const OBLIVION_LVT_KIND = "oblivion_lvt";
export const OBLIVION_TIME_KIND = "oblivion_time";

/**
 * Что висит сейчас: вечные заряды (0 — нет), безлимит до какого часа (null —
 * нет) и заряды со сроком — сколько и до какого часа.
 */
export type OblivionState = {
  level: number;
  until: string | null;
  timedLevel: number;
  timedUntil: string | null;
};

export const NO_OBLIVION: OblivionState = {
  level: 0,
  until: null,
  timedLevel: 0,
  timedUntil: null,
};

const count = (v: unknown): number => Math.max(0, Math.floor(Number(v) || 0));
const isoOf = (v: unknown): string | null =>
  typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;

/** Ответ сервера или кэша — защищённо: форма могла прийти из другой сборки. */
export function oblivionStateOf(raw: unknown): OblivionState {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const timedUntil = isoOf(o.timedUntil);
  return {
    level: count(o.level),
    until: isoOf(o.until),
    // Заряды со сроком без срока не бывают: нет часа — нет и зарядов.
    timedLevel: timedUntil ? count(o.timedLevel) : 0,
    timedUntil,
  };
}

const live = (at: string | null, now: number): boolean => !!at && Date.parse(at) > now;

/** Можно ли забывать прямо сейчас: безлимит, заряд со сроком или вечный заряд. */
export function oblivionActive(s: OblivionState, now = Date.now()): boolean {
  return s.level > 0 || live(s.until, now) || (s.timedLevel > 0 && live(s.timedUntil, now));
}

/** Строка настройки; неверная пара «уровень + минуты» — null, такое не выдаётся. */
export function parseOblivionEffect(o: Record<string, unknown>): BoostEffect | null {
  const value = oblivionLevelOf(o.value);
  const minutes = oblivionMinutesOf(o.minutes);
  return oblivionMode(value, minutes) ? { stat: "oblivion", value, minutes } : null;
}

/** Бросок: заряды (0 — без счёта) и минуты (0 — без срока) внутри диапазонов. */
export function rollOblivion(e: BoostEffect, roll: (a: number, b: number) => number): BoostRoll {
  // Неверная пара мимо разбора не даёт ничего: ни зарядов, ни времени.
  if (!oblivionMode(e.value, e.minutes)) return { stat: "oblivion", amount: 0, minutes: 0 };
  const [lo, hi] = parseRange(oblivionLevelOf(e.value));
  const [loM, hiM] = parseRange(oblivionMinutesOf(e.minutes));
  const minutes = hiM > 0 ? Math.max(1, roll(loM, hiM)) : 0;
  return { stat: "oblivion", amount: roll(lo, hi), minutes };
}

const fx = (key: string, lang: "ru" | "en", n = "", m = ""): string =>
  (fxDict[key]?.[lang] ?? "").replace("{n}", n).replace("{m}", m);

/**
 * «Забвение 3 Lv», «Забвение 3 Lv на 30 мин», «Забвение на 30 мин» (без счёта)
 * — одна подпись на зелье, заклинание, окно храма и тост броска.
 */
export function oblivionText(
  value: string | number,
  minutes: string | number,
  lang: "ru" | "en",
): string {
  const lv = oblivionLevelOf(value);
  const n = lv && lv !== "0" ? lv : "";
  const min = oblivionMinutesOf(minutes);
  if (!min) return fx(n ? "braid.oblivion_lv" : "braid.oblivion", lang, n);
  return n ? fx("braid.oblivion_lv_min", lang, n, min) : fx("braid.oblivion_min", lang, min);
}
