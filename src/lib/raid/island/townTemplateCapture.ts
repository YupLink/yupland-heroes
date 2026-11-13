// Снять шаблон города с острова дизайнера: клетки вокруг ратуши — смещениями от
// неё, по типу (местность, дорога, декор, постройка без облика). Чистая функция.
import { hexDistance } from "@/lib/raid/hex";
import { keyOf } from "@/lib/raid/zonegen/town/hex";
import type { Cell } from "@/lib/raid/worldgen/geo";
import type { IslandPlaces } from "@/lib/raid/island/steps";
import { TEMPLATE_RADIUS, type TemplateCell } from "@/lib/raid/island/townTemplate";

/** Клетка карты: абсолютные координаты, слои и блок (group_id карты). */
export type MapLayers = Omit<TemplateCell, "g"> & { gid: string | null };

/**
 * Клетки задания острова (сундук, мастерская, шахты, портал…) в шаблон не идут:
 * их ставит генератор задания. Ратуша задания — это и есть якорь, её не режем.
 */
export function taskCells(p: IslandPlaces): Set<string> {
  const one = [p.spawn, p.chest, p.workshop, p.mine, p.treasure, p.portal];
  const opt = [p.artifact, p.pack, p.shipyard].filter((c): c is Cell => c !== null);
  const all = [...one, ...opt, ...p.trees, ...p.monsters, ...p.crystals, ...p.mines, ...p.digs];
  return new Set(all.map((c) => keyOf(c)));
}

/**
 * Шаблон вокруг ратуши at: круг TEMPLATE_RADIUS без клеток, которые ближе к
 * другой ратуше (соседний город — не наш). Вода — не местность шаблона: клетка
 * без суши в шаблон не идёт (город не режет берег). Клетка задания — пустая
 * (её место расчищено, а не оставлено лесом острова). Блоки — номерами.
 */
export function captureTemplate(
  cells: readonly MapLayers[],
  at: Cell,
  halls: readonly Cell[],
  skip: ReadonlySet<string>,
  isWater: (id: string) => boolean,
): TemplateCell[] {
  const others = halls.filter((h) => h.q !== at.q || h.r !== at.r);
  const blocks = new Map<string, number>();
  const out: TemplateCell[] = [];
  for (const c of cells) {
    const d = hexDistance(c.q, c.r, at.q, at.r);
    if (d > TEMPLATE_RADIUS) continue;
    if (others.some((h) => hexDistance(c.q, c.r, h.q, h.r) < d)) continue;
    const t = c.t !== null && isWater(c.t) ? null : c.t;
    const [q, r] = [c.q - at.q, c.r - at.r];
    if (skip.has(keyOf(c))) {
      if (t !== null) out.push({ q, r, t, rd: null, d: null, b: null });
      continue;
    }
    if (t === null) continue;
    let g: number | null = null;
    if (c.gid !== null) {
      g = blocks.get(c.gid) ?? blocks.size;
      blocks.set(c.gid, g);
    }
    out.push({ q, r, t, rd: c.rd, d: c.d, b: c.b, g, s: g === null ? null : (c.s ?? null) });
  }
  return out;
}

/** Ратуша, ближайшая к тапу (в пределах трёх клеток): тап по блоку — соседка. */
export function nearestHall(halls: readonly Cell[], tap: Cell): Cell | null {
  let best: Cell | null = null;
  let bestD = 4;
  for (const h of halls) {
    const d = hexDistance(h.q, h.r, tap.q, tap.r);
    if (d < bestD) [best, bestD] = [h, d];
  }
  return best;
}
