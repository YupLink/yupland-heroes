// Ход автомата на сервере: действие игрока → новое состояние. Всё случайное
// (барабаны, кучки, клад, карты) разыгрывается ЗДЕСЬ сервером, из браузера
// приходит только «что нажал». Деньги — разница баланса до и после хода.
import { BET_OPTIONS, LINE_OPTIONS } from "./bets";
import { startBonus, startSuper } from "./bonus";
import { evaluateSpin } from "./evaluate";
import { rollGrid } from "./reels";
import { nextRisk, resolvePick, showMissed, startRisk } from "./risk";
import { slotReducer } from "./reducer";
import type { SlotState } from "./state";
import type { Rng } from "./types";

export type ClientAction =
  | { type: "spin"; lines: number; bet: number }
  | { type: "collect" }
  | { type: "risk-start" }
  | { type: "risk-pick"; index: number }
  | { type: "risk-next" }
  | { type: "risk-take" }
  | { type: "risk-close" }
  | { type: "bonus-enter" }
  | { type: "bonus-pick"; col: number }
  | { type: "bonus-close" }
  | { type: "super-enter" }
  | { type: "super-pick"; side: 0 | 1 }
  | { type: "super-next" }
  | { type: "bonus-finish" }
  | { type: "stats-reset" };

/** Вид сделки в журнале золота. */
export function moneyKind(a: ClientAction): string {
  if (a.type === "spin") return "slot_spin";
  if (a.type.startsWith("risk")) return "slot_risk";
  return "slot_bonus";
}

export class SlotRefused extends Error {}

/** Применить ход. Баланс `state.balance` перед вызовом — настоящее золото. */
export function serverStep(state: SlotState, a: ClientAction, rng: Rng): SlotState {
  const r = (s: SlotState, action: Parameters<typeof slotReducer>[1]) => slotReducer(s, action);
  switch (a.type) {
    case "spin": {
      if (!(LINE_OPTIONS as readonly number[]).includes(a.lines))
        throw new SlotRefused("slot.bad_bet");
      if (!(BET_OPTIONS as readonly number[]).includes(a.bet))
        throw new SlotRefused("slot.bad_bet");
      if (state.phase !== "idle" && state.phase !== "won") throw new SlotRefused("slot.busy");
      if (state.balance < a.lines * a.bet) throw new SlotRefused("slot.not_enough");
      const s = { ...state, lines: a.lines, bet: a.bet };
      const spun = r(s, { type: "spin", result: evaluateSpin(rollGrid(rng), a.lines, a.bet) });
      if (spun.phase !== "spinning") throw new SlotRefused("slot.not_enough");
      return r(spun, { type: "stopped" });
    }
    case "risk-start":
      return r(state, { type: "risk-start", risk: startRisk(state.lastWin, rng) });
    case "risk-next":
      return state.risk ? r(state, { type: "risk-next", risk: nextRisk(state.risk, rng) }) : state;
    case "risk-pick":
      // Карты сданы при раздаче — выбор их открывает. Проигрыш: среди невыбранных
      // показываем такую же или старше (showMissed).
      if (state.phase !== "risk" || !state.risk) return state;
      {
        const dealt = resolvePick(state.risk, a.index, rng);
        const next = r(dealt === state.risk ? state : { ...state, risk: dealt }, a);
        return next !== state && next.risk && next.risk.outcome === "lose"
          ? { ...next, risk: showMissed(next.risk, rng) }
          : next;
      }
    case "bonus-enter": {
      const s = r(state, { type: "bonus-enter" });
      return s === state ? state : r(s, { type: "bonus-start", bonus: startBonus(rng) });
    }
    case "super-enter": {
      const s = r(state, { type: "super-enter" });
      return s === state ? state : r(s, { type: "super-start", superGame: startSuper(rng) });
    }
    default:
      return r(state, a);
  }
}

/** Случайность сервера: криптостойкий генератор, не Math.random. */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(1);
  return () => {
    globalThis.crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  };
}
