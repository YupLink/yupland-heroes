// Прогон слота через то же состояние, что у экрана: бот-игрок жмёт кнопки по
// выбранному стилю. Нужен для проверки отдачи «в общем ключе» — с удвоением,
// бонусом и супер-бонусом, ровно как играет человек. Только для тестов и замеров.
import { BONUS_COLS, reachedShore, startBonus, startSuper } from "./bonus";
import { evaluateSpin } from "./evaluate";
import { rollGrid } from "./reels";
import { nextRisk, resolvePick, startRisk } from "./risk";
import { slotReducer } from "./reducer";
import { initialSlotState, type SlotState } from "./state";
import type { Rng } from "./types";

/**
 * Как игрок обходится с удвоением после выигрыша:
 * • never — не рискует; once / two — одно / два удвоения и забрать;
 * • max — до упора (5 удвоений или проигрыш), против любой карты; random — как попало;
 * • peek — забирает при карте соперника 9+; low — выше 5; ace — при тузе;
 * • smart — УМНЫЙ (лучшая стратегия при честной колоде): рискует против карт до
 *   10 (после 3-го удвоения — до 9, после 4-го — до 8), иначе забирает. На него
 *   настроены барабаны: у него 90 %, у остальных — меньше.
 */
export type RiskStyle =
  | "never"
  | "once"
  | "two"
  | "max"
  | "random"
  | "peek"
  | "low"
  | "ace"
  | "smart";

export const RISK_STYLES: readonly RiskStyle[] = [
  "never",
  "once",
  "two",
  "max",
  "random",
  "peek",
  "low",
  "ace",
  "smart",
];

export function seededRng(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wantsRisk(style: RiskStyle, rng: Rng): boolean {
  if (style === "never") return false;
  if (style === "random") return rng() < 0.3;
  return true;
}

function keepsDoubling(style: RiskStyle, s: SlotState, rng: Rng): boolean {
  if (style === "once") return (s.risk?.rounds ?? 0) < 1;
  if (style === "two") return (s.risk?.rounds ?? 0) < 2;
  if (style === "random") return rng() < 0.5;
  return true;
}

/** Забрать до выбора, глядя на карту соперника. */
function takesBeforePick(style: RiskStyle, dealer: number, rounds = 0): boolean {
  if (style === "smart") return dealer > (rounds < 3 ? 10 : rounds === 3 ? 9 : 8);
  if (style === "peek") return dealer >= 9;
  if (style === "low") return dealer > 5;
  if (style === "ace") return dealer >= 14;
  return false;
}

/** Один ход бота по текущей фазе. */
export function botStep(s: SlotState, style: RiskStyle, rng: Rng): SlotState {
  switch (s.phase) {
    case "idle":
    case "won":
      if (s.phase === "won" && wantsRisk(style, rng))
        return slotReducer(s, { type: "risk-start", risk: startRisk(s.lastWin, rng) });
      return slotReducer(s, { type: "spin", result: evaluateSpin(rollGrid(rng), s.lines, s.bet) });
    case "spinning":
      return slotReducer(s, { type: "stopped" });
    case "risk": {
      const r = s.risk!;
      if (r.picked === null) {
        if (takesBeforePick(style, r.dealer.rank, r.rounds))
          return slotReducer(s, { type: "risk-take" });
        // Как на сервере: исход выпадает в момент выбора, карты — под него.
        const index = Math.floor(rng() * 4);
        return slotReducer(
          { ...s, risk: resolvePick(r, index, rng) },
          { type: "risk-pick", index },
        );
      }
      if (r.outcome === "lose") return slotReducer(s, { type: "risk-close" });
      if (r.done || (r.outcome === "win" && !keepsDoubling(style, s, rng)))
        return slotReducer(s, { type: "risk-take" });
      return slotReducer(s, { type: "risk-next", risk: nextRisk(r, rng) });
    }
    case "bonus-won":
      return slotReducer(s, { type: "bonus-enter" });
    case "bonus": {
      if (!s.bonus) return slotReducer(s, { type: "bonus-start", bonus: startBonus(rng) });
      if (s.bonus.fell) return slotReducer(s, { type: "bonus-close" });
      if (reachedShore(s.bonus)) return slotReducer(s, { type: "super-enter" });
      return slotReducer(s, { type: "bonus-pick", col: Math.floor(rng() * BONUS_COLS) });
    }
    case "super": {
      const g = s.superGame;
      if (!g) return slotReducer(s, { type: "super-start", superGame: startSuper(rng) });
      if (g.done) return slotReducer(s, { type: "bonus-close" });
      if (g.lastPick === "hit") return slotReducer(s, { type: "super-next" });
      return slotReducer(s, { type: "super-pick", side: rng() < 0.5 ? 0 : 1 });
    }
    case "bonus-end":
      return slotReducer(s, { type: "bonus-finish" });
  }
}

export type SimResult = {
  state: SlotState;
  topups: number;
  /** Нарушение учёта: баланс ≠ старт + пополнения − ставки + выигрыши. */
  ledgerBroken: boolean;
  steps: number;
};

export type SimOptions = {
  /** Ставка на линию и число линий. */
  bet?: number;
  lines?: number;
  /** Стартовый баланс. */
  start?: number;
  /** Кончились кредиты — стоп (иначе бот пополняет и играет дальше). */
  stopWhenBroke?: boolean;
};

/** Прогон `spins` спинов. По умолчанию ставка 1 на 9 линий, с пополнением. */
export function simulate(
  spins: number,
  style: RiskStyle,
  seed: number,
  opts: SimOptions = {},
): SimResult & { broke: boolean } {
  const { bet = 1, lines = 9, start = 1000, stopWhenBroke = false } = opts;
  const rng = seededRng(seed);
  let s: SlotState = { ...initialSlotState(start), bet, lines };
  let topups = 0;
  let steps = 0;
  let ledgerBroken = false;
  let broke = false;
  for (;;) {
    const settled = s.phase === "idle" || s.phase === "won";
    if (settled && s.stats.spins >= spins) break;
    if (settled && s.balance < s.lines * s.bet) {
      if (stopWhenBroke) {
        broke = true;
        break;
      }
      s = slotReducer(s, { type: "topup", amount: 100_000 * bet });
      topups += 100_000 * bet;
    }
    s = botStep(s, style, rng);
    steps++;
    if (s.balance !== start + topups - s.stats.wagered + s.stats.won) ledgerBroken = true;
    if (steps > spins * 80) break;
  }
  return { state: s, topups, ledgerBroken, steps, broke };
}
