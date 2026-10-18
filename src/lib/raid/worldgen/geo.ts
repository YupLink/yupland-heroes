// Геометрия мира: чанки, границы карты и точка → гекс.
//
// Чанк режется в offset-координатах (odd-r), как и границы карты у редактора
// (hex-renderer.inBoundsOffset): карта 128 — ровно чанки 0…7 по обеим осям, и
// край чанка совпадает с краем карты. Хранится же клетка в осевых (q, r) —
// так её пишут редактор и режим бога.
import { axialToOffset, offsetToAxial } from "@/lib/hex-renderer";
import { CHUNK } from "@/lib/raid/worldgen/spec";

export type Cell = { q: number; r: number };
export type ChunkKey = { cx: number; cy: number };

/** Граница карты: offset-клетки в [0, size) по обеим осям; null — мир без края. */
export type Bounds = { size: number } | null;

export const chunkId = (c: ChunkKey): string => `${c.cx},${c.cy}`;

/** Чанк клетки (q, r). */
export function chunkOf(q: number, r: number): ChunkKey {
  const { col, row } = axialToOffset(q, r);
  return { cx: Math.floor(col / CHUNK), cy: Math.floor(row / CHUNK) };
}

/** Клетки чанка в осевых координатах, по строкам (детерминированно). */
export function chunkCells(c: ChunkKey): Cell[] {
  const out: Cell[] = [];
  for (let row = c.cy * CHUNK; row < (c.cy + 1) * CHUNK; row++) {
    for (let col = c.cx * CHUNK; col < (c.cx + 1) * CHUNK; col++) out.push(offsetToAxial(col, row));
  }
  return out;
}

/** Все чанки карты размера size (size кратен CHUNK). */
export function chunksOfSize(size: number): ChunkKey[] {
  const n = Math.ceil(size / CHUNK);
  const out: ChunkKey[] = [];
  for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) out.push({ cx, cy });
  return out;
}

/** Рамка бесконечного мира в редакторе: начало — 8 × 8 чанков в её центре. */
export const ENDLESS_FRAME = 512;

/** Стартовые чанки бесконечного мира: середина рамки, 128 × 128 клеток. */
export function endlessStart(): ChunkKey[] {
  const c0 = ENDLESS_FRAME / CHUNK / 2 - 4;
  const out: ChunkKey[] = [];
  for (let cy = c0; cy < c0 + 8; cy++) for (let cx = c0; cx < c0 + 8; cx++) out.push({ cx, cy });
  return out;
}

/** Кольцо чанков вокруг уже посчитанных (восемь соседей), без них самих. */
export function frontier(have: readonly ChunkKey[]): ChunkKey[] {
  const seen = new Set(have.map(chunkId));
  const out = new Map<string, ChunkKey>();
  for (const c of have) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = { cx: c.cx + dx, cy: c.cy + dy };
        if (!seen.has(chunkId(n))) out.set(chunkId(n), n);
      }
    }
  }
  return [...out.values()].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
}

/** Клетка внутри карты (у мира без края — всегда). */
export function inBounds(b: Bounds, q: number, r: number): boolean {
  if (b === null) return true;
  const { col, row } = axialToOffset(q, r);
  return col >= 0 && row >= 0 && col < b.size && row < b.size;
}

/**
 * Точка плоскости → ближайший гекс. Обратная к noise.hexToXY (x = q + r/2,
 * y = r·√3/2) с кубическим округлением, чтобы на стыке гексов не терять клетку.
 */
export function xyToHex(x: number, y: number): Cell {
  const rf = (y * 2) / Math.sqrt(3);
  const qf = x - rf / 2;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}
