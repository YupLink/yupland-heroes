// Вспышка «куда убежал беглец»: событие побега → красная стрелка на 0.8с.
//
// Оба пути побега уже проходят через applyFled (свой шаг — useBetaMovement,
// чужой — useRaidLiveStream). Оттуда переезды (from→to) эмитятся сюда, а канвас
// подписывается и мигает стрелкой ровно на миг: «увидел, куда делся» — и погасла.
// Постоянно рисовать не нужно; беглец на то и прячется.
import type { FleeMove } from "./applyFled";

type Listener = (moves: FleeMove[]) => void;
const listeners = new Set<Listener>();

/** Разослать состоявшиеся переезды подписчикам (пустое — молча игнорируем). */
export function emitFlee(moves: FleeMove[] | undefined): void {
  if (!moves || moves.length === 0) return;
  for (const l of listeners) l(moves);
}

/** Подписаться на побеги; возвращает отписку. */
export function subscribeFlee(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
