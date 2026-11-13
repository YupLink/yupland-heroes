// Режим стройки шахты (ПРАВИЛА §8.59 п. 8) — общая арифметика клиента и
// сервера: круг клеток вокруг героя, где можно положить чертёж, и куда встаёт
// заготовка-призрак под пальцем. Без React и без сети.
import { MINE_BUILD_RADIUS, type PlaceableBlueprint } from "@/lib/minePlacement";

/** Клетка круга: можно ли положить чертёж и почему нет (ключ словаря mineplace.*). */
export type MineCandidate = { q: number; r: number; ok: boolean; reason: string | null };

/** Мой чертёж шахты на карте — виден только мне. */
export type MinePlanView = {
  /** Карта чертежа: на другой карте (этаже) его не рисуют и не тапают. */
  mapId: string;
  q: number;
  r: number;
  kind: PlaceableBlueprint;
  stackKey: string;
  /** Энергия на постановку (minePlaceEnergy). */
  energy: number;
};

type Hex = { q: number; r: number };

/** Гекс-расстояние в осевых координатах. */
export const hexDist = (a: Hex, b: Hex): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

/** Все клетки в радиусе вокруг центра: центр первым, дальше кольцами (19 при радиусе 2). */
export function hexDisk(c: Hex, radius = MINE_BUILD_RADIUS): Hex[] {
  const out: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq++)
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++)
      out.push({ q: c.q + dq, r: c.r + dr });
  return out.sort((a, b) => hexDist(a, c) - hexDist(b, c));
}

/** Центр клетки на плоскости (остроконечные гексы, единица — радиус гекса). */
const px = (h: Hex) => ({ x: Math.sqrt(3) * (h.q + h.r / 2), y: 1.5 * h.r });

/**
 * Куда встаёт призрак: клетка под пальцем, а палец ушёл за круг — ближайшая
 * к нему клетка края (заготовку «тянет» по краю, а не бросает).
 */
export function snapToDisk(center: Hex, q: number, r: number, radius = MINE_BUILD_RADIUS): Hex {
  if (hexDist(center, { q, r }) <= radius) return { q, r };
  const p = px({ q, r });
  let best = center;
  let bestD = Infinity;
  for (const h of hexDisk(center, radius)) {
    const o = px(h);
    const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

/** Первая позиция призрака: ближайшая зелёная клетка рядом с героем, иначе соседняя. */
export function firstGhost(center: Hex, cells: readonly MineCandidate[] | null): Hex {
  const green = cells?.find((c) => c.ok && hexDist(c, center) > 0) ?? cells?.find((c) => c.ok);
  return green ? { q: green.q, r: green.r } : { q: center.q + 1, r: center.r };
}

/** Клетка круга под призраком (null — круг ещё не пришёл или призрак вне его). */
export function candidateAt(
  cells: readonly MineCandidate[] | null,
  at: Hex | null,
): MineCandidate | null {
  if (!cells || !at) return null;
  return cells.find((c) => c.q === at.q && c.r === at.r) ?? null;
}
