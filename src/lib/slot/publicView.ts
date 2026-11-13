// Что из состояния автомата можно показать браузеру. Скрытое — что лежит под
// неоткрытыми кучками, где клад на будущих попытках, карты удвоения до выбора —
// заменяется заглушкой: иначе страница знала бы ответ заранее.
//
// Карты удвоения после выбора открываются ВСЕ (владелец, 15.10.2026): игрок
// видит, что лежало рядом. Это безопасно — раунд уже разыгран, а следующий
// (risk-next) сдаёт новые четыре карты, старые больше ни на что не влияют.
//
// Ступень динамических барабанов (reels) браузеру не отдаётся вовсе.
import type { SlotState } from "./state";

/** Значение под неоткрытой кучкой и сторона неразыгранной попытки. */
export const HIDDEN = -1;

export function publicView(s: SlotState): SlotState {
  const bonus = s.bonus
    ? {
        ...s.bonus,
        board: s.bonus.board.map((row, r) =>
          row.map((v, c) => (s.bonus!.picks[r] === c ? v : HIDDEN)),
        ),
      }
    : null;
  const superGame = s.superGame
    ? {
        ...s.superGame,
        friend: s.superGame.friend.map((f, i) =>
          i < s.superGame!.step || (s.superGame!.lastPick === "miss" && i === s.superGame!.step)
            ? f
            : HIDDEN,
        ),
      }
    : null;
  const risk = s.risk
    ? {
        ...s.risk,
        hand: s.risk.picked === null ? s.risk.hand.map(() => ({ rank: 0, suit: 0 })) : s.risk.hand,
      }
    : null;
  return { ...s, bonus, superGame, risk, reels: undefined };
}
