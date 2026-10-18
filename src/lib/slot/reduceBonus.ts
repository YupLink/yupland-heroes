// Редьюсер бонусной игры «Раскопки» и супер-бонуса «Ночной раскоп».
import { nextSuper, pickFloe, pickSide, reachedShore } from "./bonus";
import type { SlotAction, SlotState } from "./state";

export function reduceBonus(state: SlotState, action: SlotAction): SlotState {
  switch (action.type) {
    case "bonus-start":
      if (state.phase !== "bonus") return state;
      return { ...state, bonus: action.bonus, superGame: null, bonusTotal: 0 };
    case "bonus-pick": {
      if (state.phase !== "bonus" || !state.bonus) return state;
      const bonus = pickFloe(state.bonus, action.col, state.bonusStake);
      // Ловушка показывается на экране, закрытие — отдельным действием после паузы.
      // Прошёл все ряды — последняя находка остаётся на экране, в супер-бонус
      // переводит хук через паузу (super-enter).
      return { ...state, bonus };
    }
    case "super-enter":
      if (state.phase !== "bonus" || !state.bonus || !reachedShore(state.bonus)) return state;
      return { ...state, phase: "super" };
    case "super-start":
      if (state.phase !== "super") return state;
      return { ...state, superGame: action.superGame };
    case "super-pick": {
      if (state.phase !== "super" || !state.superGame || !state.bonus) return state;
      // Промах/последняя попытка остаются на экране, закрытие — после паузы (bonus-close).
      return { ...state, superGame: pickSide(state.superGame, action.side, state.bonusStake) };
    }
    case "super-next": {
      if (state.phase !== "super" || !state.superGame) return state;
      return { ...state, superGame: nextSuper(state.superGame) };
    }
    case "bonus-close": {
      // Итог бонуса: найденное на раскопе + набранное в супер-бонусе (не сгорает).
      if ((state.phase !== "bonus" && state.phase !== "super") || !state.bonus) return state;
      const total = state.bonus.won + (state.superGame?.pot ?? 0);
      return { ...state, phase: "bonus-end", bonusTotal: total };
    }
    case "bonus-finish": {
      if (state.phase !== "bonus-end") return state;
      // Выигрыш бонуса — в статистику сессии (иначе «Отдача» занижена).
      return {
        ...state,
        phase: "idle",
        balance: state.balance + state.bonusTotal,
        bonus: null,
        superGame: null,
        stats: {
          ...state.stats,
          won: state.stats.won + state.bonusTotal,
          bestWin: Math.max(state.stats.bestWin, state.bonusTotal),
        },
      };
    }
    default:
      return state;
  }
}
