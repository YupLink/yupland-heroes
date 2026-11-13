// Окно «Выпало» после покупки рецепта (ПРАВИЛА §8.104) — мимо окна лавки, как
// у ломбарда (pawnDropBus): лавка после сделки закрывается, а итог должен
// остаться на экране. Корзина берёт строки по очереди — призы сводим в одно окно.
import { useSyncExternalStore } from "react";
import type { RecipePrize } from "@/lib/marketRecipe";

let current: RecipePrize[] | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const fn of listeners) fn();
};

/** Призы со всех покупок корзины → одно окно; одинаковое складываем. */
export function showRecipePrizes(lists: ReadonlyArray<RecipePrize[] | null | undefined>): void {
  const all = lists.flatMap((l) => (Array.isArray(l) ? l : []));
  if (!all.length) return;
  const merged = new Map<string, RecipePrize>();
  for (const p of all) {
    const key = `${p.kind}:${p.refId ?? ""}:${p.name}`;
    const was = merged.get(key);
    merged.set(key, was ? { ...was, count: was.count + p.count } : { ...p });
  }
  current = [...merged.values()];
  emit();
}

export function closeRecipePrizes(): void {
  current = null;
  emit();
}

export function useRecipePrizes(): RecipePrize[] | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => current,
  );
}
