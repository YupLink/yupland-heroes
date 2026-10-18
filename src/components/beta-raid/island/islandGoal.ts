// Клетка, куда ведёт шаг острова: «иди туда — там задание» (владелец,
// 16.10.2026: «подсвечивать не объект, а ячейку в темноте»). Туман не
// открывается — на карте только рамка клетки. Живёт мимо React, как точки
// игроков: кадр карты читает её сам и перерисовывается один раз на смену.
export type Goal = { q: number; r: number } | null;

let goal: Goal = null;
const listeners = new Set<() => void>();

export const getIslandGoal = (): Goal => goal;

export function setIslandGoal(next: Goal): void {
  if (next === goal || (next && goal && next.q === goal.q && next.r === goal.r)) return;
  goal = next;
  for (const fn of listeners) fn();
}

export function subscribeIslandGoal(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
