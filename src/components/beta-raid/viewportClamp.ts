// Границы прокрутки карты: дальше разведанного (плюс пара гексов запаса)
// камеру не пускаем — иначе игрок уезжает в чёрное поле и теряет карту.
//
// Клэмп учитывает РАЗМЕР вьюпорта (W/H): карту нельзя оттащить так, чтобы её
// край зашёл ВНУТРЬ экрана и открыл чёрное. Раньше W/H не учитывались, и край
// доезжал до ЦЕНТРА — на узком экране незаметно, а в полноэкранном (высокий
// вьюпорт) сверху/снизу зияло чёрное и карта «сворачивалась».
//
// Запас за краем — не только пара гексов, но и доля экрана (тестеры, 26.10.2026: «на
// новых картах карта упирается в лимит, бегу вверх — кнопка „Идти“ залезает под
// панель; дай чуть заходить за неоткрытое»): герой у края разведанного встаёт ниже
// верхней панели, плашка маршрута над ним остаётся видна.
import { R, axialToPixel } from "./hexGeometry";

export type Bounds = { minQ: number; maxQ: number; minR: number; maxR: number } | null;

/** Сколько экрана можно заехать за край разведанного: по ширине и по высоте. */
export const EDGE_SLACK_X = 0.3;
export const EDGE_SLACK_Y = 0.35;

/**
 * Ограничить смещение по одной оси. lo/hi — край карты в мировых×scale
 * координатах (с запасом), half — половина размера вьюпорта по этой оси.
 * Карта больше экрана — держим её края СНАРУЖИ вьюпорта; меньше — центрируем.
 */
function clampAxis(v: number, lo: number, hi: number, half: number): number {
  const a = half - hi; // нижняя граница смещения: дальний край у дальней стороны
  const b = -half - lo; // верхняя граница: ближний край у ближней стороны
  if (a <= b) return Math.max(a, Math.min(b, v));
  return -(lo + hi) / 2; // карта уже вьюпорта — центрируем разведанное
}

export function clampToBounds(
  next: { x: number; y: number },
  scale: number,
  bounds: Bounds,
  centerQ: number,
  c0q: number,
  W: number,
  H: number,
): { x: number; y: number } {
  if (!bounds) return next;
  const corners = [
    axialToPixel(bounds.minQ, bounds.minR, centerQ, c0q),
    axialToPixel(bounds.maxQ, bounds.maxR, centerQ, c0q),
    axialToPixel(bounds.minQ, bounds.maxR, centerQ, c0q),
    axialToPixel(bounds.maxQ, bounds.minR, centerQ, c0q),
  ];
  const xs = corners.map((c) => c.x * scale);
  const ys = corners.map((c) => c.y * scale);
  const padX = R * 2 * scale + W * EDGE_SLACK_X;
  const padY = R * 2 * scale + H * EDGE_SLACK_Y;
  const minX = Math.min(...xs) - padX;
  const maxX = Math.max(...xs) + padX;
  const minY = Math.min(...ys) - padY;
  const maxY = Math.max(...ys) + padY;
  return {
    x: clampAxis(next.x, minX, maxX, W / 2),
    y: clampAxis(next.y, minY, maxY, H / 2),
  };
}
