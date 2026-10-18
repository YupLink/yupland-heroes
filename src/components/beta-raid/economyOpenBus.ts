// Мини-шина «открыть/свернуть» для панели «$ Экономика».
//
// Кнопка живёт в панели админа над картой (AdminRaidRestore), а САМА панель
// — под картой (BetaRaidScreen). Пропсами прогонять флаг через 5 слоёв
// незачем: держим текущее состояние тут и подписываемся из BetaRaidScreen.
type Listener = (open: boolean) => void;

let currentOpen = false;
const listeners = new Set<Listener>();

export function economyOpen(): boolean {
  return currentOpen;
}

export function subscribeEconomyOpen(fn: Listener): () => void {
  listeners.add(fn);
  fn(currentOpen);
  return () => listeners.delete(fn);
}

export function toggleEconomyOpen(next?: boolean): void {
  const v = typeof next === "boolean" ? next : !currentOpen;
  if (v === currentOpen) return;
  currentOpen = v;
  for (const fn of listeners) fn(currentOpen);
}
