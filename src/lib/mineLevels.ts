// Уровни шахт v2 (владелец, 23.10.2026; ПРАВИЛА §8.74). Общий модуль клиента и
// сервера; те же числа — в SQL (migrations/minev2-82-gold-5-50.sql:
// raid_mine_level_yields / raid_mine_level) — меняются только вместе.
//
//  • Уровень лежит в настройке клетки (mineLevel; нет — 1). Захват, поломка и
//    починка его не трогают, разборка чистит клетку — новая шахта всегда 1.
//  • Добыча в час по уровням — у шахт мира; остров (§8.59 п. 11) не улучшают.
//  • Цена шага — с уровня N на N+1 (индекс N−1). Улучшает только Строитель.
import type { MineV2Resource } from "./mineV2";

type Cost = Partial<Record<MineV2Resource, number>>;

/** Добыча в час по уровням (индекс 0 — уровень 1). Длина — предел уровня. */
export const MINE_LEVEL_YIELD: Record<MineV2Resource, readonly number[]> = {
  wood: [10, 20, 30, 50],
  stone: [1, 5, 10, 20],
  // Коррекция владельца 26.10.2026 (minev2-82): 5 / 10 / 25 / 50 (было 1 / 5 / 10 / 20).
  gold: [5, 10, 25, 50],
  diamonds: [1, 2, 3, 5],
};

/** Цена улучшения: [1→2, 2→3, 3→4]. */
export const MINE_UPGRADE_COST: Record<MineV2Resource, readonly Cost[]> = {
  wood: [{ diamonds: 1 }, { diamonds: 2 }, { diamonds: 5 }],
  stone: [{ diamonds: 1 }, { diamonds: 2 }, { diamonds: 5 }],
  gold: [{ diamonds: 1 }, { diamonds: 2 }, { diamonds: 5 }],
  diamonds: [{ gold: 1_000 }, { gold: 5_000 }, { gold: 10_000 }],
};

/** Предел уровня вида. */
export const mineMaxLevel = (kind: MineV2Resource): number => MINE_LEVEL_YIELD[kind].length;

/** Уровень из настройки клетки (как SQL raid_mine_level): целое 1..99, иначе 1. */
export function mineLevelOf(cfg: unknown): number {
  const raw = (cfg as { mineLevel?: unknown } | null)?.mineLevel;
  const n = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : 1;
}

/** Добыча в час вида на уровне (выше предела — последний, как SQL). */
export function mineLevelYield(kind: MineV2Resource, level: number): number {
  const ys = MINE_LEVEL_YIELD[kind];
  const i = Math.min(Math.max(1, Math.floor(level) || 1), ys.length) - 1;
  return ys[i];
}

/** Цена шага с уровня level на следующий; null — предел. */
export function mineUpgradeCost(kind: MineV2Resource, level: number): Cost | null {
  if (level >= mineMaxLevel(kind)) return null;
  return MINE_UPGRADE_COST[kind][Math.max(1, Math.floor(level)) - 1] ?? null;
}
