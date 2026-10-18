// Общий редьюсер слота: базовая игра + риск, затем бонус + супер.
import { reduceBase } from "./reduceBase";
import { reduceBonus } from "./reduceBonus";
import type { SlotAction, SlotState } from "./state";

const BONUS_ACTIONS = new Set<SlotAction["type"]>([
  "bonus-start",
  "bonus-pick",
  "super-enter",
  "super-start",
  "super-pick",
  "super-next",
  "bonus-close",
  "bonus-finish",
]);

/** Баланс за сессию: начальный (перед первым спином), минимум, максимум, пополнения. */
function trackBalance(prev: SlotState, next: SlotState, action: SlotAction): SlotState {
  if (next === prev) return next;
  let st = next.stats;
  if (action.type === "topup") st = { ...st, topups: st.topups + action.amount };
  if (st.spins === 0) return st === next.stats ? next : { ...next, stats: st };
  if (prev.stats.spins === 0) {
    st = {
      ...st,
      startBalance: prev.balance,
      minBalance: Math.min(prev.balance, next.balance),
      maxBalance: Math.max(prev.balance, next.balance),
    };
  } else if (next.balance < st.minBalance || next.balance > st.maxBalance || st !== next.stats) {
    st = {
      ...st,
      minBalance: Math.min(st.minBalance, next.balance),
      maxBalance: Math.max(st.maxBalance, next.balance),
    };
  }
  return st === next.stats ? next : { ...next, stats: st };
}

export function slotReducer(state: SlotState, action: SlotAction): SlotState {
  const next = BONUS_ACTIONS.has(action.type)
    ? reduceBonus(state, action)
    : reduceBase(state, action);
  return trackBalance(state, next, action);
}
