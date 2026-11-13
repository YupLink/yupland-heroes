// Дорожки замка: общий тип клетки, ширина и запасная форма сети.
//
// CastlePathLayer.tsx (PR #180, 20.10.2026) импортирует этот модуль, но сам
// файл в PR не попал — сборка падала («Could not resolve ./castlePaths»), и
// игра не выкатывалась. Здесь — поведение до PR: без готового маршрута
// (routeShape из roadSegments) дорожки не рисуются, ширина 32.
export type PathCell = [number, number];

export const PATH_WIDTH = 32;

/** Форма сети по клеткам. Пока клетки не рисуются — дорожки идут только по сегментам. */
export function pathNetworkShape(_cells: readonly PathCell[]): string {
  return "";
}
