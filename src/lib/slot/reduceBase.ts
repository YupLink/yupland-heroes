// Редьюсер базовой игры и риск-игры. Бонус и супер — в reduceBonus.ts.
// Выигрыш спина зачисляется сам; «Риск» снимает его с баланса на кон.
import { BET_OPTIONS, MAX_BET, MAX_LINES, totalBet } from "./bets";
import { pickCard } from "./risk";
import { EMPTY_STATS, type SlotAction, type SlotState, type SlotStats } from "./state";

/** Куда идти, когда выигрыш спина закрыт (забран или проигран в риске). */
export function afterCollect(state: SlotState): SlotState {
  // Бонус выпал: барабаны докрутились, выигрыш линий зачислен — окно «бонус выигран»,
  // в игру — только по кнопке.
  if (state.bonusQueued) return { ...state, phase: "bonus-won", bonusQueued: false, auto: false };
  return { ...state, phase: "idle" };
}

function addWin(stats: SlotStats, won: number): SlotStats {
  return { ...stats, won: stats.won + won, bestWin: Math.max(stats.bestWin, won) };
}

const settable = (p: SlotState["phase"]) => p === "idle" || p === "won";

export function reduceBase(state: SlotState, action: SlotAction): SlotState {
  switch (action.type) {
    case "set-lines":
      if (!settable(state.phase)) return state;
      return { ...state, lines: Math.max(1, Math.min(MAX_LINES, action.lines)) };
    case "next-bet": {
      if (!settable(state.phase)) return state;
      const i = BET_OPTIONS.indexOf(state.bet as (typeof BET_OPTIONS)[number]);
      return { ...state, bet: BET_OPTIONS[(i + 1) % BET_OPTIONS.length] };
    }
    case "max-bet":
      if (!settable(state.phase)) return state;
      return { ...state, lines: MAX_LINES, bet: MAX_BET };
    case "toggle-auto":
      return { ...state, auto: !state.auto };
    case "set-balance":
      // Баланс из браузера при загрузке — не пополнение и не игра.
      return { ...state, balance: action.balance };
    case "topup":
      return { ...state, balance: state.balance + action.amount };
    case "stats-reset":
      return { ...state, stats: EMPTY_STATS };
    case "spin": {
      if (!settable(state.phase)) return state;
      const stake = totalBet(state.lines, state.bet);
      if (state.balance < stake) return { ...state, auto: false };
      return {
        ...state,
        phase: "spinning",
        balance: state.balance - stake,
        lastWin: 0,
        result: action.result,
        bonusQueued: action.result.bonus,
        bonusStake: action.result.bonus ? stake : state.bonusStake,
        spinId: state.spinId + 1,
        stats: {
          ...state.stats,
          spins: state.stats.spins + 1,
          wagered: state.stats.wagered + stake,
          bonuses: state.stats.bonuses + (action.result.bonus ? 1 : 0),
        },
      };
    }
    case "stopped": {
      if (state.phase !== "spinning" || !state.result) return state;
      const win = state.result.totalWin;
      if (win <= 0) return afterCollect(state);
      // Автозабор: выигрыш сразу на балансе, риск — по желанию.
      const next = {
        ...state,
        balance: state.balance + win,
        lastWin: win,
        stats: addWin(state.stats, win),
      };
      return state.bonusQueued ? afterCollect(next) : { ...next, phase: "won" };
    }
    case "collect":
      if (state.phase !== "won") return state;
      return afterCollect(state);
    case "bonus-enter":
      if (state.phase !== "bonus-won") return state;
      return { ...state, phase: "bonus" };
    case "risk-start":
      if (state.phase !== "won" || state.lastWin <= 0 || state.balance < state.lastWin)
        return state;
      return {
        ...state,
        phase: "risk",
        risk: action.risk,
        pending: state.lastWin,
        balance: state.balance - state.lastWin,
        auto: false,
        stats: {
          ...state.stats,
          won: state.stats.won - state.lastWin,
          riskGames: state.stats.riskGames + 1,
          riskIn: state.stats.riskIn + state.lastWin,
        },
      };
    case "risk-pick": {
      if (state.phase !== "risk" || !state.risk) return state;
      const risk = pickCard(state.risk, action.index);
      if (risk === state.risk) return state; // карта уже открыта
      const stats = {
        ...state.stats,
        riskWins: state.stats.riskWins + (risk.outcome === "win" ? 1 : 0),
        riskLosses: state.stats.riskLosses + (risk.outcome === "lose" ? 1 : 0),
      };
      // Проигрыш остаётся на экране: игрок видит карту и закрывает кнопкой (risk-close).
      if (risk.outcome === "lose") return { ...state, risk, pending: 0, lastWin: 0, stats };
      return { ...state, risk, pending: risk.stake, stats };
    }
    case "risk-next":
      // Новая раздача — только после выбора карты (выигрыш или ничья). До выбора
      // карта соперника уже видна: пересдача была бы бесплатной, и игрок ждал бы
      // двойку у соперника и не проигрывал никогда (дыра 14.10, вторая после «Забрать»).
      if (
        state.phase !== "risk" ||
        !state.risk ||
        state.risk.picked === null ||
        state.risk.done ||
        state.risk.outcome === "lose"
      )
        return state;
      return { ...state, risk: action.risk };
    case "risk-close":
      if (state.phase !== "risk") return state;
      return afterCollect({ ...state, risk: null, pending: 0, lastWin: 0 });
    case "risk-take": {
      // «Забрать» есть всегда, пока на кону что-то есть (владелец, 15–17.10.2026):
      // увидел карту соперника и не стал рисковать, или после выигрыша. После
      // проигрыша — нечего. Отдачу 90 % держат барабаны (risk.ts, reels.ts).
      if (state.phase !== "risk" || !state.risk || state.risk.outcome === "lose") return state;
      const taken = state.pending;
      return afterCollect({
        ...state,
        risk: null,
        balance: state.balance + taken,
        pending: 0,
        lastWin: taken,
        stats: { ...addWin(state.stats, taken), riskOut: state.stats.riskOut + taken },
      });
    }
    default:
      return state;
  }
}
