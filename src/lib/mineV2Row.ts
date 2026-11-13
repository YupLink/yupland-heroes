// Шахта v2 в ответах сервера: строки «моих шахт» (Добыча, плашка сбора) и окно.
//
// Клиент считает живую добычу одной формулой livePendingAmount(capturedAt,
// claimedHours, yield, maxHours) — у всех видов шахт. Для v2 она даёт ровно
// minePendingV2, если подставить:
//   capturedAt — начало отрезка добычи (accrue_from),
//   yield      — стандарт вида × множитель режима,
//   maxHours   — часы от начала отрезка до поломки (дальше шахта не копит),
//   stepHours  — шаг выплаты (алмаз острова — сутки, остальное — час).
// Так экраны «Добычи» не знают про режимы и запас, а числа совпадают с SQL.
import {
  mineBreakAt,
  mineMode,
  mineStdYield,
  mineV2Step,
  type MineMode,
  type MineV2Resource,
} from "./mineV2";

const HOUR_MS = 3_600_000;

/** Запас службы шахты v2 — как он лежит в базе, плюс вычисленная поломка. */
export type MineV2Life = {
  mode: MineMode;
  /** Доля запаса (0..1) на момент lifeAt. */
  lifeLeft: number;
  /** ISO-время, на которое записан lifeLeft. */
  lifeAt: string;
  /** Когда шахта сломается (мс). */
  breakAt: number;
  /** Уже сломана (сборщик ещё не снял владельца). */
  broken: boolean;
};

/** Запас из сырых чисел ответа базы (life_at — мс). */
export function mineV2Life(
  raw: { mode: string | null; lifeLeft: number | string | null; lifeAtMs: number | string | null },
  now = Date.now(),
): MineV2Life {
  const mode = mineMode(raw.mode).id;
  const lifeLeft = Math.min(1, Math.max(0, Number(raw.lifeLeft) || 0));
  const at = Number(raw.lifeAtMs);
  const lifeAt = new Date(Number.isFinite(at) && at > 0 ? at : now).toISOString();
  const breakAt = mineBreakAt({ mode, lifeLeft, lifeAt });
  return { mode, lifeLeft, lifeAt, breakAt, broken: now >= breakAt };
}

/**
 * Стандарт из базы, если он есть; иначе — по виду (уровень 1). Ноль — настоящий:
 * лесопилка без деревьев рядом стоит (§8.80), а не «нет числа».
 */
const stdOf = (std: number | null | undefined, kind: MineV2Resource, island: boolean): number =>
  std != null && String(std).trim() !== "" && Number(std) >= 0
    ? Number(std)
    : mineStdYield(kind, island);

/**
 * Поля для livePendingAmount у шахты v2 (см. шапку). island — флаг клетки острова;
 * std — стандарт в час из базы (raid_mine_v2_std: с уровнем шахты, §8.74); нет — по виду.
 */
export function mineV2PendingArgs(o: {
  resource: MineV2Resource;
  mode: MineMode;
  accrueFromMs: number;
  breakAt: number;
  island?: boolean;
  std?: number | null;
}): { capturedAt: number; yield: number; maxHours: number | null; stepHours: number } {
  const span = (o.breakAt - o.accrueFromMs) / HOUR_MS;
  const island = !!o.island;
  return {
    capturedAt: o.accrueFromMs,
    // Сломалась в самом начале отрезка — копить нечего.
    yield: span > 0 ? stdOf(o.std, o.resource, island) * mineMode(o.mode).mult : 0,
    maxHours: span > 0 ? span : null,
    stepHours: mineV2Step(o.resource, island),
  };
}
