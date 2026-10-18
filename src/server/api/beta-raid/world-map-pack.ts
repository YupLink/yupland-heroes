// Карта мира из основы карты: местность сеткой, метки построек, мои клады, туман.
//
// Чистая функция без базы: на вход — клетки основы (map-base), словарь
// местности, метки построек (вид по поведению — world-map-building), мои клады
// и острова разведанного; на выход — ответ телефону (worldMapCodec). Из клетки
// берутся только q, r, местность и купол: объекты (мобы, боссы, артефакты,
// сундуки), декор, дороги и мешочки сюда не попадают вовсе — ни клеткой, ни
// меткой. Клады — только то, что закопал сам игрок (world-map-treasures),
// отдельным входом.
import { hexDistance } from "@/lib/raid/hex";
import {
  encodeRuns,
  WORLD_MARK_KINDS,
  type WorldMapMode,
  type WorldMapTerrain,
  type WorldMapWire,
  type WorldMarkKind,
} from "@/lib/raid/worldMapCodec";
import { isVoidFlag } from "./packCells";

export type WorldCellIn = { q: number; r: number; terrain_id: string | null; void_fog?: unknown };
export type WorldTerrainIn = { id: string; name: string; image_url: string | null };
export type WorldMark = { kind: WorldMarkKind; q: number; r: number; group: string | null };
/** Клетка моего клада (world-map-treasures). */
export type TreasureCell = { q: number; r: number };

type Box = { q0: number; r0: number; cols: number; rows: number };

const EMPTY_BOX: Box = { q0: 0, r0: 0, cols: 0, rows: 0 };

function boxOf(cells: readonly WorldCellIn[], keep: (c: WorldCellIn) => boolean): Box {
  let minQ = Infinity;
  let maxQ = -Infinity;
  let minR = Infinity;
  let maxR = -Infinity;
  for (const c of cells) {
    if (!keep(c)) continue;
    if (c.q < minQ) minQ = c.q;
    if (c.q > maxQ) maxQ = c.q;
    if (c.r < minR) minR = c.r;
    if (c.r > maxR) maxR = c.r;
  }
  if (minQ > maxQ) return EMPTY_BOX;
  return { q0: minQ, r0: minR, cols: maxQ - minQ + 1, rows: maxR - minR + 1 };
}

/**
 * Острова разведанного «r,q0,n;…» (world-map-seen) → маска по рамке карты.
 * Клетки тумана за рамкой (карту с тех пор обрезали) отбрасываются.
 */
export function islandsMask(islands: string, box: Box): Uint8Array {
  const mask = new Uint8Array(box.cols * box.rows);
  if (!islands) return mask;
  for (const part of islands.split(";")) {
    const [r, q0, n] = part.split(",").map(Number);
    const row = r - box.r0;
    if (!Number.isInteger(row) || !Number.isInteger(q0) || !(n > 0)) continue;
    if (row < 0 || row >= box.rows) continue;
    const from = Math.max(0, q0 - box.q0);
    const to = Math.min(box.cols, q0 - box.q0 + n);
    if (from < to) mask.fill(1, row * box.cols + from, row * box.cols + to);
  }
  return mask;
}

export function packWorldMap(input: {
  mode: WorldMapMode;
  cells: readonly WorldCellIn[];
  terrains: readonly WorldTerrainIn[];
  marks: readonly WorldMark[];
  /** Мои клады: в обоих режимах и на любой клетке — игрок знает, где закопал. */
  treasures: readonly TreasureCell[];
  /** Острова разведанного (world-map-seen) — только для «Разведанного». */
  seen: string | null;
}): WorldMapWire {
  const { mode, cells } = input;
  const all = mode === "all";
  const full = boxOf(cells, (c) => !!c.terrain_id);
  const mask = all ? null : islandsMask(input.seen ?? "", full);
  // «Разведанное» — глазами игрока: купол он не видит никогда, даже если
  // клетка под ним числится разведанной (админ ходит сквозь купол).
  const shown = (c: WorldCellIn): boolean => {
    if (!c.terrain_id) return false;
    if (!mask) return true;
    if (isVoidFlag(c.void_fog)) return false;
    return mask[(c.r - full.r0) * full.cols + (c.q - full.q0)] === 1;
  };
  const box = all ? full : boxOf(cells, shown);
  const grid = new Uint16Array(box.cols * box.rows);
  const dict = new Map(input.terrains.map((t) => [t.id, t]));
  const palette = new Map<string, number>();
  const terrains: WorldMapTerrain[] = [];
  for (const c of cells) {
    if (!shown(c)) continue;
    const id = c.terrain_id as string;
    let v = palette.get(id);
    if (v === undefined) {
      const t = dict.get(id);
      terrains.push({ id, name: t?.name ?? "", img: t?.image_url ?? null });
      v = terrains.length;
      palette.set(id, v);
    }
    grid[(c.r - box.r0) * box.cols + (c.q - box.q0)] = v;
  }
  return {
    mode,
    ...box,
    terrains,
    runs: encodeRuns(grid),
    marks: [...packMarks(input.marks, grid, box), ...packTreasures(input.treasures)],
  };
}

/**
 * Клады — мимо тумана и рамки: метка встаёт и на клетку, которой нет в
 * разведанном (купол накрыл её позже). Одна метка на клетку.
 */
function packTreasures(list: readonly TreasureCell[]): number[] {
  const kind = WORLD_MARK_KINDS.indexOf("treasure");
  const out: number[] = [];
  const seen = new Set<string>();
  for (const t of list) {
    const key = `${t.q},${t.r}`;
    if (!Number.isInteger(t.q) || !Number.isInteger(t.r) || seen.has(key)) continue;
    seen.add(key);
    out.push(kind, t.q, t.r);
  }
  return out;
}

/** Метки только на показанных клетках; блок режима бога — одной меткой посередине. */
function packMarks(marks: readonly WorldMark[], grid: Uint16Array, box: Box): number[] {
  const out: number[] = [];
  const blocks = new Map<string, WorldMark[]>();
  for (const m of marks) {
    const col = m.q - box.q0;
    const row = m.r - box.r0;
    if (col < 0 || row < 0 || col >= box.cols || row >= box.rows) continue;
    if (!grid[row * box.cols + col]) continue;
    if (!m.group) {
      out.push(WORLD_MARK_KINDS.indexOf(m.kind), m.q, m.r);
      continue;
    }
    // Здание блока стоит на нескольких клетках сразу — меток было бы столько же.
    const key = `${m.kind}|${m.group}`;
    const list = blocks.get(key);
    if (list) list.push(m);
    else blocks.set(key, [m]);
  }
  for (const list of blocks.values()) {
    const mid = middleOf(list);
    out.push(WORLD_MARK_KINDS.indexOf(mid.kind), mid.q, mid.r);
  }
  return out;
}

/** Клетка блока, ближайшая к его середине: метка встаёт под картинку здания. */
function middleOf(list: WorldMark[]): WorldMark {
  let sq = 0;
  let sr = 0;
  for (const m of list) {
    sq += m.q;
    sr += m.r;
  }
  const cq = sq / list.length;
  const cr = sr / list.length;
  let best = list[0];
  let bestD = Infinity;
  for (const m of list) {
    const d = hexDistance(m.q, m.r, cq, cr);
    if (d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}
