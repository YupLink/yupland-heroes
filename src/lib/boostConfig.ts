// Настройка постройки-БУСТА: что она даёт герою и сколько просит за подход.
//
// Живёт на КЛЕТКЕ (building_config.boost), как портал и шахта: один и тот же
// облик «Алтарь» в разных концах карты может давать разное и стоить разное.
// Настройки шаблона тут запасной вариант — так же, как у дерева уровней.
//
// Эффектов может быть несколько (список), каждый со своим диапазоном пунктов
// и минут — оба одним полем формата «1-10». Цена — те же строки «ресурс +
// сколько», что у портала и стройки, включая товар из рюкзака.
import type { PortalPrice } from "./portal";
import { emptyBoostEffect, parseBoostEffects, type BoostEffect } from "./hero/boost";

export type BoostCellConfig = {
  effects: BoostEffect[];
  /** Что просят за одно взаимодействие. Пусто — бесплатно. */
  prices: PortalPrice[];
};

export const DEFAULT_BOOST: BoostCellConfig = {
  effects: [emptyBoostEffect()],
  prices: [],
};

const pricesOf = (raw: unknown): PortalPrice[] =>
  Array.isArray(raw)
    ? (raw as PortalPrice[]).filter((p) => p && typeof p === "object").map((p) => ({ ...p }))
    : [];

/**
 * Настройка как есть — для редактора: строки не выбрасываем, даже пустые.
 * Иначе свежий эффект исчезал бы под пальцем, не дождавшись ввода.
 */
export function boostConfigDraft(cellConfig: unknown): BoostCellConfig {
  const raw = (cellConfig as { boost?: unknown } | null)?.boost as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return { effects: [emptyBoostEffect()], prices: [] };
  const list = Array.isArray(raw.effects) ? (raw.effects as BoostEffect[]) : draftLegacy(raw);
  return {
    effects: list.length > 0 ? list.map((e) => ({ ...e })) : [emptyBoostEffect()],
    prices: pricesOf(raw.prices),
  };
}

/** Старая одиночная запись `{stat, min, max, minutes}` — показываем строкой. */
function draftLegacy(raw: Record<string, unknown>): BoostEffect[] {
  return parseBoostEffects(raw);
}

/**
 * Рабочая настройка КОНКРЕТНОЙ клетки: сначала своя, потом шаблона.
 * null — алтарь не настроен и не работает (о чём молчим, а не пишем «0»).
 */
export function cellBoost(cellConfig: unknown, meta: unknown): BoostCellConfig | null {
  return own(cellConfig) ?? own(meta);
}

function own(src: unknown): BoostCellConfig | null {
  const raw = (src as { boost?: unknown } | null)?.boost;
  const effects = parseBoostEffects(raw);
  if (effects.length === 0) return null;
  const prices = validPrices((raw as { prices?: unknown } | null)?.prices);
  return { effects, prices };
}

/**
 * Бесплатный алтарь с «Забвением»: такой не выдаёт ничего (boost-action.ts) —
 * иначе уровни забвения раздавались бы даром и без счёта.
 */
export const freeOblivion = (cfg: BoostCellConfig): boolean =>
  cfg.prices.length === 0 && cfg.effects.some((e) => e.stat === "oblivion");

/** Строки цены с положительной суммой: нулевые в счёт не идут. */
function validPrices(raw: unknown): PortalPrice[] {
  return pricesOf(raw).filter((p) => (Number(p.amount) || 0) > 0);
}
