// Меню входа для ChipsEntry: новичку — «Начать игру», остальным — пропуск.
// Решение принимается один раз на полную загрузку страницы: меню закрыли,
// запрос упал, игрок не новичок или ответ не успел за START_MENU_WAIT_MS после
// готовности игры — меню больше не встанет, даже если запрос потом ответит или
// экран смонтируется заново.
import { useCallback, useEffect, useState } from "react";
import type { GameStartOption } from "@/server/api/game-start";
import type { InviteWho } from "@/lib/referralShare";
import { useGameStartStatus } from "./useGameStart";
import { startMenuMode, type StartMenuMode } from "./startMenuMode";

// Module state resets on a full page load; in-app navigation does not replay the menu.
let startMenuClosed = false;

/** Сколько ждать ответа меню, когда игра под заставкой уже готова. */
export const START_MENU_WAIT_MS = 4000;

export function useStartMenu(
  /** Игрок на экране игры (вошёл, не гость и не старый интерфейс). */
  inGame: boolean,
  wallet: string | null,
  gameReady: boolean,
): {
  mode: StartMenuMode;
  options: GameStartOption[];
  invite: InviteWho | null;
  close: () => void;
} {
  const [open, setOpen] = useState(() => !startMenuClosed);
  const close = useCallback(() => {
    startMenuClosed = true;
    setOpen(false);
  }, []);
  const asked = open && inGame && !!wallet;
  const status = useGameStartStatus(asked, wallet);
  const mode = startMenuMode(asked, status);
  // Пропустили (не новичок, ошибка) — насовсем.
  useEffect(() => {
    if (asked && mode === "skip") close();
  }, [asked, mode, close]);
  // Игра готова, а ответа нет — ждём не дольше потолка, дальше входим без меню.
  useEffect(() => {
    if (!gameReady || mode !== "pending") return;
    const id = setTimeout(close, START_MENU_WAIT_MS);
    return () => clearTimeout(id);
  }, [gameReady, mode, close]);
  return { mode, options: status.data?.options ?? [], invite: status.data?.invite ?? null, close };
}
