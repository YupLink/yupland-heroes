// Докуда хватит энергии: сколько первых шагов маршрута оплачивает то, что есть
// (владелец, 25.10.2026, как в «Героях 3»). Эти стрелки зелёные, дальше —
// красные; «Идти» ведёт героя до последней зелёной, а не гасится целиком.
//
// Считаем тем же счётом, что и плашка маршрута (usePathBadgeTarget): цена шага
// плюс энергия двери на клетке шага — дверь берёт её тем же счётчиком.
import type { DoorTollMap } from "./pathTolls";

/** Энергия из цены двери на этой клетке; нет двери — 0. */
function doorEnergy(tolls: DoorTollMap | undefined, q: number, r: number): number {
  const cfg = tolls?.[`${q},${r}`];
  if (!cfg) return 0;
  return cfg.prices.reduce((s, p) => s + (p.resource === "energy" ? p.amount : 0), 0);
}

/** Сколько первых шагов пути можно пройти на energy (0…path.length). */
export function pathReach(
  path: ReadonlyArray<{ q: number; r: number; cost: number }>,
  energy: number,
  tolls?: DoorTollMap,
): number {
  let spent = 0;
  for (let i = 0; i < path.length; i++) {
    const s = path[i];
    spent += s.cost + doorEnergy(tolls, s.q, s.r);
    // Запас на хвост двоичной дроби: 0.92 × 9 не должно стать «чуть больше 8.28».
    if (spent > energy + 1e-9) return i;
  }
  return path.length;
}

/**
 * Энергия на весь путь: цены шагов плюс энергия дверей на них. Это «дорога»
 * плашки маршрута (usePathBadgeTarget), и то же число пишет кнопка окна рубки.
 */
export function walkEnergy(
  path: ReadonlyArray<{ q: number; r: number; cost: number }>,
  tolls?: DoorTollMap,
): number {
  return path.reduce((sum, s) => sum + s.cost + doorEnergy(tolls, s.q, s.r), 0);
}
