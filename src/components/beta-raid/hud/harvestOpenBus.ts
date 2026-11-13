// «Открой Добычу» снаружи окна (§8.106): кнопка «Показать» письма о потере
// шахты в другом мире (castle-live/useMineLink) открывает «Добычу» на карте,
// где лежит её строка. Подписчик — HUD карты; его ещё нет — ждём монтирования.
let pending = false;
const subs = new Set<() => void>();

export function requestOpenHarvest(): void {
  if (subs.size === 0) {
    pending = true;
    return;
  }
  for (const f of subs) f();
}

export function subscribeOpenHarvest(f: () => void): () => void {
  subs.add(f);
  if (pending) {
    pending = false;
    queueMicrotask(f);
  }
  return () => {
    subs.delete(f);
  };
}
