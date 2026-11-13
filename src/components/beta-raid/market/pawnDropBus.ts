// Окно «что выпало» после сдачи героя в ломбард (ПРАВИЛА §8.73 п. 4) — мимо
// окна лавки: оно закрывается после сделки, а окно уведомления должно остаться.
// Корзина сдаёт строки по очереди — выпавшее со всех сделок сводится в одно окно.
import { useSyncExternalStore } from "react";
import type { PawnDrop } from "@/lib/pawnDrop";

let current: PawnDrop | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const fn of listeners) fn();
};

/** Ответ сервера → окно; старый ответ без поля или «нечего» — ничего. */
export function showPawnDrops(drops: ReadonlyArray<PawnDrop | null | undefined>): void {
  const list = drops.filter(
    (d): d is PawnDrop => !!d && Array.isArray(d.items) && (d.items.length > 0 || d.arts > 0),
  );
  if (!list.length) return;
  const last = list[list.length - 1];
  current = {
    q: last.q,
    r: last.r,
    items: list.flatMap((d) => d.items),
    arts: list.reduce((n, d) => n + (Number(d.arts) || 0), 0),
  };
  emit();
}

export function closePawnDrop(): void {
  current = null;
  emit();
}

export function usePawnDrop(): PawnDrop | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    // Сервер окно не показывает (сюда пишет только клиент) — тот же снимок.
    () => current,
  );
}
