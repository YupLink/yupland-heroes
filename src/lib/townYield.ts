// Добыча города с окрестности (владелец, 08.10.2026: «не 8 клеток в округе, а
// 10 — 21 в диаметре»). Выработка за сутки = сумма по клеткам вокруг
// (шанс × объём) + сумма по декору (объём) — по таблице townYieldTable.
//
// Клетку, до которой дотягиваются две ратуши, считает ближайшая; при равном
// расстоянии — поровну: одна грядка не кормит два города сразу.
import { TERRAIN_GROUPS, YIELD_TABLE, type YieldRow } from "./townYieldTable";
import type { TownGood } from "./townConfig";

/** Радиус окрестности: 10 клеток от ратуши, 21 в поперечнике. */
export const TOWN_AREA_RADIUS = 10;

/** Обычная рыба — весь улов, если доли рыбалки не заданы. */
export const PLAIN_FISH = "cst_jkxm6tnvuudp";

export type Hex = { q: number; r: number };
export type AreaCell = Hex & { terrainId: string | null; decorId: string | null };
export type FishShare = { id: string; pct: number };

export const hexDist = (a: Hex, b: Hex): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q - b.q + a.r - b.r)) / 2;

const mid = (v: [number, number]) => (v[0] + v[1]) / 2;

/** Добыча с окрестности для товара ратуши: только свои товары (cst_…). */
export const areaOf = (
  g: Pick<TownGood, "kind" | "refId">,
  area: Record<string, number>,
): number => (g.kind === "custom" && g.refId ? (area[g.refId] ?? 0) : 0);

const groupOf = new Map<string, string>();
for (const [g, ids] of Object.entries(TERRAIN_GROUPS)) for (const id of ids) groupOf.set(id, g);

/** Шанс товара на местности: своя строка главнее группы. */
export function chanceOn(row: YieldRow, terrainId: string): number {
  const own = row.land[terrainId];
  if (own !== undefined) return own;
  const g = groupOf.get(terrainId);
  return (g && row.land[g]) || 0;
}

/** Доля клетки для ратуши: 1 — её клетка, 1/k — ничья k ратуш, 0 — чужая. */
export function cellShare(cell: Hex, hall: Hex, halls: Hex[]): number {
  const mine = hexDist(cell, hall);
  const best = mine;
  let ties = 0;
  for (const h of halls) {
    const dd = hexDist(cell, h);
    if (dd < best) return 0;
    if (dd === best) ties++;
  }
  return 1 / Math.max(1, ties);
}

/** Сколько в сутки чего добывает ратуша: id товара → штук (два знака). */
export function areaYield(opts: {
  hall: Hex;
  /** Все ратуши той же карты (с этой). */
  halls: Hex[];
  cells: AreaCell[];
  /** Доли улова рыбалки; пусто — вся рыба обычная. */
  fish: FishShare[];
  radius?: number;
  table?: YieldRow[];
}): Record<string, number> {
  const radius = opts.radius ?? TOWN_AREA_RADIUS;
  const table = opts.table ?? YIELD_TABLE;
  const out: Record<string, number> = {};
  const add = (item: string, v: number) => {
    if (v > 0) out[item] = (out[item] ?? 0) + v;
  };
  for (const c of opts.cells) {
    if (hexDist(c, opts.hall) > radius) continue;
    const share = cellShare(c, opts.hall, opts.halls);
    if (!(share > 0)) continue;
    for (const row of table) {
      if (c.terrainId) add(row.item, share * chanceOn(row, c.terrainId) * mid(row.vol));
      if (c.decorId)
        for (const dd of row.decor)
          if (dd.ids.includes(c.decorId)) add(row.item, share * mid(dd.vol));
    }
  }
  const fishTotal = out.fish ?? 0;
  delete out.fish;
  if (fishTotal > 0) {
    const shares = opts.fish.filter((f) => f.pct > 0);
    const sum = shares.reduce((s, f) => s + f.pct, 0);
    if (sum > 0) for (const f of shares) add(f.id, (fishTotal * f.pct) / sum);
    else add(PLAIN_FISH, fishTotal);
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 100) / 100;
  return out;
}
