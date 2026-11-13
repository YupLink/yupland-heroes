// Письма ждут, пока игрок на своём острове или открыто окно острова (06.11.2026).
// Окна острова модальные: письмо всплывало поверх приветствия, а его «Понятно»
// не нажималось — модальное окно глушит нажатия вне себя, и новичок застревал.
// Остров — обучение; письма придут, как только он выйдет в мир.
import { useEffect, useSyncExternalStore } from "react";

const holders = new Map<string, number>();
const listeners = new Set<() => void>();
let held = false;

function emit(): void {
  const next = [...holders.values()].some((n) => n > 0);
  if (next === held) return;
  held = next;
  for (const l of listeners) l();
}

/** Придержать письма (повторный вызов с тем же id — счётчик, снимается парно). */
export function holdLetters(id: string, on: boolean): void {
  const n = (holders.get(id) ?? 0) + (on ? 1 : -1);
  if (n > 0) holders.set(id, n);
  else holders.delete(id);
  emit();
}

/** Держит ли кто-нибудь письма сейчас. */
export const lettersHeld = (): boolean => held;

export function useLettersHeld(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    lettersHeld,
    () => false,
  );
}

/** Держать письма, пока on (и пока компонент на экране). */
export function useHoldLetters(id: string, on: boolean): void {
  useEffect(() => {
    if (!on) return;
    holdLetters(id, true);
    return () => holdLetters(id, false);
  }, [id, on]);
}
