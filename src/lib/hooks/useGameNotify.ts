// «Уведомления в игре»: включены ли информационные тосты игры — HP цели,
// побег беглеца, размер награды.
//
// По умолчанию ВЫКЛЮЧЕНЫ (владелец, 08.10.2026: «очень надоедают — убери их
// вовсе, а лучше чтобы вообще не было»). Кому они нужны — включает сам в
// настройках; хранится только «on», выключить = стереть ключ.
//
// Выбор живёт на устройстве, в localStorage: Zustand в проекте только для
// кошелька и языка, persist react-query тоже не для этого.
//
// Читается и вне React — обёртка gameInfoToast спрашивает перед каждым тостом.
// Хранилища может не быть (сервер, запрет в вебвью, переполнено) — тогда
// выбор держим в памяти до перезагрузки, а не роняем экран.
import { useSyncExternalStore } from "react";

export const GAME_NOTIFY_KEY = "game-info-toasts";

/** Выбор, который не удалось записать; null — верим хранилищу. */
let memory: boolean | null = null;
const listeners = new Set<() => void>();

export function readGameNotify(): boolean {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(GAME_NOTIFY_KEY) === "on";
  } catch {
    return false;
  }
}

export function setGameNotify(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(GAME_NOTIFY_KEY, "on");
    else window.localStorage.removeItem(GAME_NOTIFY_KEY);
    memory = null;
  } catch {
    memory = on;
  }
  for (const listener of listeners) listener();
}

/** Подписка на переключение: без неё выключатель не перерисуется сразу. */
export function subscribeGameNotify(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** [включены ли уведомления, переключить]. На сервере — выключены. */
export function useGameNotify(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribeGameNotify, readGameNotify, () => false);
  return [on, setGameNotify];
}
