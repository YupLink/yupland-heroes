// Локальный набор побеждённых клеток: оптимистичная отметка markCellDefeated
// живит здесь, переживая рефетчи карты. Сервер убирает объект через ~5с
// (dead-sweep); когда он долетит в live.expired — ключ отсюда вычистится.
//
// Это решает баг «фантомных объектов»: карта рефетчится, сервер ещё не убрал
// объект (dead-sweep не успел), и на долю секунды объект «воскресает».

const localDefeated = new Set<string>();

/** Добавить клетку в локальный набор побеждённых. */
export function addLocalDefeated(key: string): void {
  localDefeated.add(key);
}

/** Убрать клетку из локального набора (когда сервер подтвердил). */
export function removeLocalDefeated(key: string): void {
  localDefeated.delete(key);
}

/** Получить текущий набор. */
export function getLocalDefeated(): Set<string> {
  return localDefeated;
}
