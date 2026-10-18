// Постройка «ЗАБВЕНИЕ»: настройка на клетке и что её окно узнаёт от сервера.
//
// Настройка живёт как у столба заклинаний: building_config.oblivion клетки, а
// нет своей — meta.oblivion шаблона. Цена — строки «ресурс + сколько»
// (PortalPrice, берутся все разом, как у портала и столба); уровень и время —
// одним полем в формате проекта («3», «1-3», «30», «10-20»). Что даёт пара —
// правило lib/hero/oblivionRule.ts: уровень без минут — заряды, с минутами —
// заряды со сроком, «0» с минутами — без счёта; «0» или пусто без минут —
// ошибка. Без цены постройка не настроена: получить нельзя.
import type { PortalPrice } from "./portal";
import {
  oblivionEffectsOk,
  oblivionLevelOf,
  oblivionMinutesOf,
  oblivionMode,
} from "./hero/oblivionRule";

export type OblivionCellConfig = {
  /** Чем платят. Пусто — постройка не настроена. */
  prices: PortalPrice[];
  /** Сколько заклинаний можно забыть: «1», «1-3»; «0» — без счёта (только со временем). */
  level: string;
  /** Время действия в минутах: «30», «10-20». Пусто — заряды без срока. */
  minutes: string;
};

/** Что окно постройки узнаёт о «Забвении» (сервер → окно). */
export type OblivionExtra = {
  kind: "oblivion";
  prices: PortalPrice[];
  level: string;
  minutes: string;
  can: boolean;
  reasonKey: string | null;
  reasonParams?: Record<string, string | number>;
};

export const EMPTY_OBLIVION: OblivionCellConfig = { prices: [], level: "1", minutes: "" };

const pricesOf = (raw: unknown): PortalPrice[] =>
  Array.isArray(raw)
    ? (raw as PortalPrice[]).filter((p) => p && typeof p === "object").map((p) => ({ ...p }))
    : [];

const text = (v: unknown, dflt: string): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : dflt;

const section = (raw: unknown): Record<string, unknown> | null => {
  const s = (raw as { oblivion?: unknown } | null)?.oblivion;
  return s && typeof s === "object" ? (s as Record<string, unknown>) : null;
};

/** Уровень храма: поля нет — 1, так его и показывает форма; иначе как задал админ. */
const levelRaw = (o: Record<string, unknown>): string => text(o.level, "1");

/** Настройка как есть — для формы админа: пустые строки цены не выбрасываем. */
export function oblivionConfigDraft(cellConfig: unknown): OblivionCellConfig {
  const o = section(cellConfig);
  if (!o) return { ...EMPTY_OBLIVION };
  return { prices: pricesOf(o.prices), level: levelRaw(o), minutes: text(o.minutes, "") };
}

/** Рабочая настройка или причина, по которой получить нельзя. */
export type OblivionCellCheck =
  | { ok: true; cfg: OblivionCellConfig }
  | { ok: false; reasonKey: "oblivion.not_set" | "oblivion.bad_setup" };

/** Настройка ЭТОЙ клетки, а нет своей — шаблона. Выдача и окно спрашивают одно. */
export function checkCellOblivion(cellConfig: unknown, meta: unknown): OblivionCellCheck {
  const o = section(cellConfig) ?? section(meta);
  const prices = o ? pricesOf(o.prices).filter((p) => (Number(p.amount) || 0) > 0) : [];
  if (!o || prices.length === 0) return { ok: false, reasonKey: "oblivion.not_set" };
  // Неверная пара, уже лежащая в базе, не выдаёт ничего — ни зарядов, ни времени.
  if (!oblivionMode(levelRaw(o), o.minutes)) return { ok: false, reasonKey: "oblivion.bad_setup" };
  const level = oblivionLevelOf(levelRaw(o));
  return { ok: true, cfg: { prices, level, minutes: oblivionMinutesOf(o.minutes) } };
}

/**
 * Сохранение конфига клетки (режим бога, редактор карт): «Забвение» алтаря
 * (boost.effects) и храма (oblivion) — только с верной парой «уровень + минуты».
 */
export function oblivionCellOk(cfg: unknown): boolean {
  if (!cfg || typeof cfg !== "object") return true;
  if (!oblivionEffectsOk((cfg as { boost?: unknown }).boost)) return false;
  const o = section(cfg);
  return !o || oblivionMode(levelRaw(o), o.minutes) !== null;
}

/**
 * Для zod-схем сохранения карты: отказ НАЗЫВАЕТ клетку — выгрузка идёт пачкой,
 * и без координат админ искал бы виноватую по всей карте. Текст по-русски, как
 * и прочие отказы этих админских ручек (обычный refine отдал бы JSON ZodError).
 */
export function assertOblivionCell(cell: string, cfg: unknown): true {
  if (oblivionCellOk(cfg)) return true;
  throw new Error(`Клетка ${cell}, «Забвение»: задай время или количество использований (уровень)`);
}
