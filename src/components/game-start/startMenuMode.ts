// Что показать на входе в игру (Архан через владельца, 22.10.2026, #497194):
// новичку (героя ещё не выбирал) — меню «Начать игру» и выбор расы героя.
// Вернувшийся игрок входит как раньше — без меню (владелец, 22.10.2026:
// «вернувшийся игрок — заходит как и заходил раньше»). Меню — только при полной
// загрузке страницы; переходы внутри игры его не повторяют. Ответ не пришёл —
// сервер ничего не решил: меню нет, игрок входит как раньше (вход важнее меню).
// Пропуск окончательный — useStartMenu закрывает меню насовсем.
import type { GameStartStatus } from "@/server/api/game-start";

export type StartMenuMode = "skip" | "pending" | "new";

export function startMenuMode(
  open: boolean,
  status: { data?: GameStartStatus; isError: boolean },
): StartMenuMode {
  if (!open) return "skip";
  // Ответ уже есть — он и решает: упавший позже повтор запроса меню не снимает
  // (новичок посреди выбора расы окно не теряет).
  if (status.data) return status.data.fresh ? "new" : "skip";
  return status.isError ? "skip" : "pending";
}
