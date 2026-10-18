// Канал разведки: открытые не ходьбой клетки (вышка) → в туман войны.
//
// Туман живёт в канвасе, а вышку игрок нажимает в окне постройки — тащить
// колбэк через полдерева ради одного действия не стоит. Маленькая шина: кто
// открыл клетки, тот их сюда кладёт, туман подписан и вливает их себе.
type Listener = (cells: string[]) => void;

const listeners = new Set<Listener>();

export function onFogReveal(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function revealFogCells(cells: string[]): void {
  if (cells.length === 0) return;
  for (const l of listeners) l(cells);
}
