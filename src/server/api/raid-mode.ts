// Какой рейд сейчас основной.
//
// «legacy» — прежние рейд-локации с цепочками боссов; «hex» — гекс-карта,
// выросшая из бета-рейда. Переключение одно на всю игру: как только старые
// рейды закрыты, гекс-карта занимает их место, называется просто «Рейд» и
// открыта всем без гейта тестеров.
import { pg } from "../db/pg";

export const LEGACY_RAIDS_KEY = "raids_legacy_enabled";

export type RaidMode = "legacy" | "hex";

/**
 * Переключатель спрашивают на КАЖДЫЙ запрос рейда — шаг, причалы, состояние,
 * посадка, сход, — и стоит он первым в цепочке, то есть все остальные рейсы
 * ждут его. Меняется он раз в жизни игры (закрытие старых рейдов), поэтому
 * полминуты кэша тут ровно того же сорта, что у активной карты (45 с),
 * тестеров (30 с) и героя (15 с).
 *
 * Кто настройку ПИШЕТ, тот сбрасывает кэш сам (raid-finish.finishLegacyRaids) —
 * ждать протухания после «рейды закрыты» никто не должен.
 */
const TTL_MS = 30_000;
let cache: { at: number; on: boolean } | null = null;

/** Настройку переписали — прежний снимок не годится. */
export function dropRaidModeCache(): void {
  cache = null;
}

/** Старые рейды ещё работают? По умолчанию да — выключается сознательно. */
export async function legacyRaidsEnabled(): Promise<boolean> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.on;
  const row = await pg.settings.findOne({ key: LEGACY_RAIDS_KEY });
  // Значения нет — считаем, что старые рейды живы (ничего не ломаем молча).
  const on = row?.value !== "false";
  cache = { at: Date.now(), on };
  return on;
}

export async function currentRaidMode(): Promise<RaidMode> {
  return (await legacyRaidsEnabled()) ? "legacy" : "hex";
}
