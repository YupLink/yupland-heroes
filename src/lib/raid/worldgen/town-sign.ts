// Табличка у въезда (владелец, 07.10.2026: «у входа табличка, где пишется
// "город такой-то"»): у первых ворот, где есть место, — сбоку от въезда, на
// свободной суше, не ближе к центру, чем сами ворота. Текст — как на
// табличках городов этого набора: «Город Драконов - Зура».
import { DIRS, hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import type { Cell } from "@/lib/raid/worldgen/geo";

/** Клетка таблички или null: у ворот всё занято или вода. */
export function signCell(
  gates: readonly Cell[],
  center: Cell,
  taken: ReadonlySet<string>,
  free: (c: Cell) => boolean,
): Cell | null {
  for (const g of gates) {
    const dg = hexDist(g, center);
    const near = DIRS.map(([dq, dr]) => ({ q: g.q + dq, r: g.r + dr }))
      .filter((c) => !taken.has(keyOf(c)) && hexDist(c, center) >= dg && free(c))
      // Сбоку от въезда (то же кольцо, что ворота) — раньше, чем поперёк дороги.
      .sort((a, b) => hexDist(a, center) - hexDist(b, center));
    if (near.length > 0) return near[0];
  }
  return null;
}

/** Текст таблички: вид города и его имя. */
export const signText = (label: string, name: string): string => `${label} - ${name}`;
