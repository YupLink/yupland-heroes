// Клетки-двери в виде маски по номерам клеток поиска пути.
//
// Отдельным модулем от самого поиска: тот и без того на пределе по объёму, а
// правило здесь одно и простое — ключ «q,r» превращается в номер клетки сетки.
import type { pathGrid } from "./pathGrid";

type Grid = ReturnType<typeof pathGrid>;

export function doorMask(grid: Grid, doors: ReadonlySet<string> | undefined): Uint8Array {
  const mask = new Uint8Array(grid.size);
  if (!doors) return mask;
  for (const key of doors) {
    const comma = key.indexOf(",");
    if (comma <= 0) continue;
    const slot = grid.slot(Number(key.slice(0, comma)), Number(key.slice(comma + 1)));
    if (slot >= 0) mask[slot] = 1;
  }
  return mask;
}
