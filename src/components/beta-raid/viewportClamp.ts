// Границы прокрутки карты: дальше разведанного (плюс пара гексов запаса)
// камеру не пускаем — иначе игрок уезжает в чёрное поле и теряет карту.
//
// Клэмп учитывает РАЗМЕР вьюпорта (W/H): карту нельзя оттащить так, чтобы её
// край зашёл ВНУТРЬ экрана и открыл чёрное. Раньше W/H не учитывались, и край
// доезжал до ЦЕНТРА — на узком экране незаметно, а в полноэкранном (высокий
// вьюпорт) сверху/снизу зияло чёрное и карта «сворачивалась».
import { R, axialToPixel } from "./hexGeometry";

export type Bounds = { minQ: number; maxQ: number; minR: number; maxR: number } | null;

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
  const pad = R * 2 * scale;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  return {
    x: clampAxis(next.x, minX, maxX, W / 2),
    y: clampAxis(next.y, minY, maxY, H / 2),
  };
}
