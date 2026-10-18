// Область мазка кисти режима бога — вынесено из useAdminBrush (≤250 строк).

/**
 * Гексагональная область кисти радиусом radius вокруг (cq,cr) — куб-дистанция
 * ≤ radius−1, как в редакторе карт. БЕЗ проверки границ: карта бета-рейда живёт
 * в аксиальных координатах (q,r бывают отрицательными и больше size), и общий
 * inBoundsAxial (ждёт offset [0,size)) резал реальные клетки — из-за него кисть
 * сводилась к одной. Крайние клетки за полем админ при желании сотрёт ластиком.
 */
export function hexArea(cq: number, cr: number, radius: number): Array<{ q: number; r: number }> {
  if (radius <= 1) return [{ q: cq, r: cr }];
  const out: Array<{ q: number; r: number }> = [];
  const rad = radius - 1;
  for (let dq = -rad; dq <= rad; dq++) {
    for (let dr = -rad; dr <= rad; dr++) {
      if (Math.abs(dq) + Math.abs(dr) + Math.abs(-dq - dr) > 2 * rad) continue;
      out.push({ q: cq + dq, r: cr + dr });
    }
  }
  return out;
}

/**
 * Потолок радиуса краски и ластика: 10/20 есть только у биом-выделения
 * (AdminBrushSizes), и оставшийся после него 20 красил бы 1141 клетку за тап.
 */
export const AREA_MAX = 5;

/** Область краски/ластика: та же hexArea, но радиус зажат потолком AREA_MAX. */
export function paintArea(cq: number, cr: number, size: number): Array<{ q: number; r: number }> {
  return hexArea(cq, cr, Math.min(size, AREA_MAX));
}
