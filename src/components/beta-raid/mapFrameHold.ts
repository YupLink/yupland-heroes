// Пауза кадров основной карты, пока поверх неё открыто окно «Карта».
//
// Окно модальное и закрывает карту почти целиком, но карта под ним жила как
// обычно: на каждый чужой шаг и событие карты перерисовывала кадр и держала
// куски статичного слоя (десятки мегабайт памяти графики). Вместе с картинкой
// ландшафта окна этого хватало, чтобы Telegram-вебвью на телефоне терял слои
// (видео владельца 23.10.2026). Пока окно открыто — последний кадр стоит как
// есть, куски отпускаются; закрыли — кадр рисуется заново.
//
// Счётчик, а не флаг: окно может открыться из двух мест сразу.
let holds = 0;
const listeners = new Set<(held: boolean) => void>();

/** Остановить кадры; вернёт функцию «отпустить» (повторный вызов безвреден). */
export function holdMapFrames(): () => void {
  holds++;
  if (holds === 1) listeners.forEach((l) => l(true));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    if (holds === 0) listeners.forEach((l) => l(false));
  };
}

export function mapFramesHeld(): boolean {
  return holds > 0;
}

/** Сообщать о начале (true) и конце (false) паузы. */
export function subscribeMapHold(listener: (held: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
