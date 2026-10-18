// Участок мира из чанков — каждая клетка целиком, как её видит мир.
//
// Порядок: простая клетка (местность, декор, объект; на тропе лабиринта декора-
// стены нет) → правки сети: дома и улицы городов, дороги между перекрёстками
// областей и городами (network, overlay) → лабиринт: в каждой ячейке, что
// задевает участок, проход ко всему (maze-apply). Города, дороги и проходы
// считаются из мира с запасом вокруг участка, поэтому чанк пишет только свои
// клетки, а соседний, посчитанный позже, сходится с ним на стыке: порядок, в
// котором растут чанки, на итог не влияет (тест «по чанку или разом»).
//
// Ратуша и лавка пишутся чанком, где стоит их клетка.
import { keyOf } from "@/lib/raid/zonegen/town/hex";
import { baseCell, townDecorAt } from "@/lib/raid/worldgen/cover";
import type { World } from "@/lib/raid/worldgen/field";
import {
  chunkCells,
  chunkId,
  chunkOf,
  inBounds,
  type Bounds,
  type Cell,
  type ChunkKey,
} from "@/lib/raid/worldgen/geo";
import { hallConfig } from "@/lib/raid/worldgen/hall";
import { mazeDecor, mazeMargin } from "@/lib/raid/worldgen/maze-apply";
import { networkNear } from "@/lib/raid/worldgen/network";
import { applyEdit, editsOf } from "@/lib/raid/worldgen/overlay";
import type { BuiltTown, TownCatalog } from "@/lib/raid/worldgen/town";
import type { WorldArea, WorldCell, WorldHall, WorldShop } from "@/lib/raid/worldgen/spec";

export type AreaInput = { chunks: readonly ChunkKey[]; bounds: Bounds; catalog: TownCatalog };

export function generateArea(w: World, inp: AreaInput): WorldArea {
  const want = new Set(inp.chunks.map(chunkId));
  const owns = (c: Cell) => want.has(chunkId(chunkOf(c.q, c.r)));
  const area = inp.chunks.flatMap(chunkCells).filter((c) => inBounds(inp.bounds, c.q, c.r));
  const net = networkNear(w, area, mazeMargin(w), inp.catalog, inp.bounds);
  const edits = editsOf(net, w.spec.towns.roadId, (t, q, r) => townDecorAt(w, t.race, q, r));
  const memo = new Map<string, WorldCell>();
  const cellOf = (q: number, r: number): WorldCell => {
    const k = keyOf({ q, r });
    let cell = memo.get(k);
    if (cell === undefined) {
      const e = edits.get(k);
      cell = e === undefined ? baseCell(w, q, r) : applyEdit(baseCell(w, q, r), e);
      memo.set(k, cell);
    }
    return cell;
  };
  const decor = mazeDecor(w, area, cellOf, inp.bounds);
  const cells = area
    .map((c) => {
      const k = keyOf(c);
      const cell = cellOf(c.q, c.r);
      return decor.has(k) ? { ...cell, decorationId: decor.get(k) ?? null } : cell;
    })
    .sort((a, b) => a.r - b.r || a.q - b.q);
  return summarize(w, cells, net.towns, owns);
}

function summarize(
  w: World,
  cells: WorldCell[],
  towns: readonly BuiltTown[],
  owns: (c: Cell) => boolean,
): WorldArea {
  const halls: WorldHall[] = [];
  const shops: WorldShop[] = [];
  for (const t of towns) {
    if (t.hall === null) continue;
    if (owns(t.hall)) {
      halls.push({ ...t.hall, config: hallConfig(w.spec.towns.templates, t.site.seed, t.name) });
    }
    for (const m of t.markets) if (owns(m)) shops.push({ ...m, hallQ: t.hall.q, hallR: t.hall.r });
  }
  const report = towns
    .filter((t) => owns(t.site))
    .map((t) => ({
      q: t.site.q,
      r: t.site.r,
      name: t.name,
      buildings: t.buildings,
      hall: t.hall !== null,
    }));
  return {
    cells,
    halls,
    shops,
    towns: report,
    roads: cells.filter((c) => c.roadId !== null).length,
  };
}
