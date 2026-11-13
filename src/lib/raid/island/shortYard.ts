// Верфь урока «лодка» на копии образца (проходка 11.11.2026): цель шага была
// «ближайшая к старту верфь» — на «Бар-На» это (20,38), а её Кай замуровала ежами
// (2000 HP) и деревьями: новичок получал «Туда не пройти». Теперь — ближайшая
// ПЕШКОМ от старта верфь, от которой лодка доплывает до цели переправы.
// Пешком — как у маршрута (hexPassable.walkable): суша, без декора, без живого
// объекта, не шахта.
import { keyOf } from "@/lib/raid/zonegen/town/hex";
import type { Cell } from "@/lib/raid/worldgen/geo";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import { around, flood } from "./shortLessonFit";

export function pickShortYard(
  cells: readonly WorldCell[],
  from: Cell,
  water: { shallow: string; ocean: string },
  yardId: string,
  sail: readonly Cell[],
): Cell | null {
  const by = new Map(cells.map((c) => [keyOf(c), c]));
  const walk = (k: string) => {
    const c = by.get(k);
    const effect = (c?.buildingConfig as { effect?: unknown } | null | undefined)?.effect;
    return !!c?.terrainId && c.terrainId !== water.shallow && c.terrainId !== water.ocean
      && !c.decorationId && !c.objectId && effect !== "mine";
  };
  const foot = flood([from], walk);
  // Судну — вода без декора (водоросли) и без живого объекта, как в маршруте.
  const sea = (k: string) => {
    const c = by.get(k);
    return c?.terrainId === water.shallow && !c.decorationId && !c.objectId;
  };
  const targets = sail.map(keyOf);
  let best: { cell: Cell; steps: number } | null = null;
  for (const y of cells.filter((c) => c.buildingId === yardId)) {
    const steps = foot.get(keyOf(y));
    if (steps === undefined) continue;
    const reach = flood(around(y).filter((n) => sea(keyOf(n))), sea);
    if (!targets.some((t) => reach.has(t))) continue;
    if (!best || steps < best.steps) best = { cell: { q: y.q, r: y.r }, steps };
  }
  return best?.cell ?? null;
}
