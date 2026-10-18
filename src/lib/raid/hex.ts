// Гекс-арифметика без зависимостей: общая для сервера и клиента.
/** Расстояние между клетками в аксиальных координатах. */
export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;
}
