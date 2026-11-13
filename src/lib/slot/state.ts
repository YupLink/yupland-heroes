// Состояние слота: один редьюсер на базовую игру, риск, бонус и супер.
import type { BonusState, SuperState } from "./bonus";
import type { RiskState } from "./risk";
import type { SpinResult } from "./types";

export type Phase =
  | "idle"
  | "spinning"
  | "won"
  | "bonus-won"
  | "risk"
  | "bonus"
  | "super"
  | "bonus-end";

/** Статистика сессии — для проверки отдачи «на глаз». */
export type SlotStats = {
  spins: number;
  wagered: number;
  won: number;
  bonuses: number;
  bestWin: number;
  /** Удвоение: сколько раз начинали, угадано, сгорело. */
  riskGames: number;
  riskWins: number;
  riskLosses: number;
  /** Сколько поставили в удвоение и сколько из него забрали (кредиты). */
  riskIn: number;
  riskOut: number;
  /** Баланс перед первым спином сессии, минимум и максимум за сессию. */
  startBalance: number;
  minBalance: number;
  maxBalance: number;
  /** Сколько демо-кредитов добавлено кнопкой за сессию. */
  topups: number;
};

export type SlotState = {
  phase: Phase;
  balance: number;
  lines: number;
  bet: number;
  result: SpinResult | null;
  /** Выигрыш последнего спина (уже на балансе) — его можно поставить в риск. */
  lastWin: number;
  /** Сумма на кону в риск-игре (снята с баланса). */
  pending: number;
  /** После спина ждёт бонусная игра. */
  bonusQueued: boolean;
  /** Ставка за спин, с которой открылась бонусная игра. */
  bonusStake: number;
  bonus: BonusState | null;
  superGame: SuperState | null;
  risk: RiskState | null;
  /** Итог последней бонусной игры (для экрана «бонус окончен»). */
  bonusTotal: number;
  /** Счётчик спинов — ключ для анимаций. */
  spinId: number;
  /** Автокрутка включена. */
  auto: boolean;
  stats: SlotStats;
  /** Мягкая тяга барабанов (reelLevel.ts). Только на сервере — браузеру не
   *  отдаётся (publicView). У игравших до 09.11 — старые ступени `{level, at, cap}`,
   *  их заменяет первый же спин. */
  reels?: SlotReels | { level: number; at: number; cap: number };
};

/** Барабаны игрока: наборы сетки (reelGrid.ts) и память его удвоения. */
export type SlotReels = {
  /** На каком спине поставлена цель. */
  at: number;
  /** Набор на эти спины и набор «90 % для умного» (потолок на поднятую ставку). */
  set: number;
  safe: number;
  /** Средняя ставка за спин за всю игру и за последние ~200 спинов. */
  cap: number;
  stake: number;
  /** Выигрыш линий и прибавка от выборов в удвоении (кредиты, с затуханием):
   *  долгая память (~1000 спинов) и короткая (~60). */
  raw: number;
  edge: number;
  rawS: number;
  edgeS: number;
};

export type SlotAction =
  | { type: "set-lines"; lines: number }
  | { type: "next-bet" }
  | { type: "max-bet" }
  | { type: "toggle-auto" }
  | { type: "topup"; amount: number }
  | { type: "set-balance"; balance: number }
  | { type: "spin"; result: SpinResult }
  | { type: "stopped" }
  | { type: "collect" }
  | { type: "risk-start"; risk: RiskState }
  | { type: "risk-pick"; index: number }
  | { type: "risk-next"; risk: RiskState }
  | { type: "risk-take" }
  | { type: "risk-close" }
  | { type: "bonus-enter" }
  | { type: "bonus-start"; bonus: BonusState }
  | { type: "bonus-pick"; col: number }
  | { type: "super-enter" }
  | { type: "super-start"; superGame: SuperState }
  | { type: "super-pick"; side: 0 | 1 }
  | { type: "super-next" }
  | { type: "bonus-close" }
  | { type: "bonus-finish" }
  | { type: "stats-reset" };

export const EMPTY_STATS: SlotStats = {
  spins: 0,
  wagered: 0,
  won: 0,
  bonuses: 0,
  bestWin: 0,
  riskGames: 0,
  riskWins: 0,
  riskLosses: 0,
  riskIn: 0,
  riskOut: 0,
  startBalance: 0,
  minBalance: 0,
  maxBalance: 0,
  topups: 0,
};

export function initialSlotState(balance = 0): SlotState {
  return {
    phase: "idle",
    balance,
    lines: 9,
    bet: 1,
    result: null,
    lastWin: 0,
    pending: 0,
    bonusQueued: false,
    bonusStake: 0,
    bonus: null,
    superGame: null,
    risk: null,
    bonusTotal: 0,
    spinId: 0,
    auto: false,
    stats: EMPTY_STATS,
  };
}
