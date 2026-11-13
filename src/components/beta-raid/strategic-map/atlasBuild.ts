// Картинка разведанного ландшафта окна «Карта»: размер по экрану, сборка
// порциями по времени.
//
// Было: всегда 2048×2048 (16 МБ памяти графики) и по 2500 клеток за кадр —
// на телефоне ×4 это кадры по 100–150 мс подряд. Стало: сторона — полтора
// экрана в пикселях устройства (Xiaomi 13T: 1344, 7 МБ), а за кадр — сколько
// успеется за бюджет. Клетка рисуется ровно как раньше: тайл гекса, без
// тайла — заливка, тонкая обводка.
import { HexTileCache, TILE_DRAW_H, TILE_DRAW_W } from "../hexTileCache";
import { hexPath2D } from "../hexGeometry";
import type { TerrainGeometry } from "./terrainGeometry";

const MIN_SIDE = 768;
const MAX_SIDE = 2048;

/** Сторона картинки: полтора меньших размера экрана в пикселях устройства (плотность до 2). */
export function atlasSide(screenMin: number, dpr: number): number {
  const ratio = Math.min(2, Math.max(1, Number.isFinite(dpr) ? dpr : 1));
  const px = Math.max(1, Number.isFinite(screenMin) ? screenMin : 0) * ratio * 1.5;
  return Math.max(MIN_SIDE, Math.min(MAX_SIDE, Math.ceil(px / 64) * 64));
}

export type SliceOptions = {
  /** Сколько миллисекунд кадра можно занять (хотя бы 16 клеток за порцию). */
  budgetMs: number;
  now: () => number;
  schedule: (run: () => void) => unknown;
  unschedule?: (handle: unknown) => void;
  /** После каждой порции: сколько уже готово. */
  onSlice?: (done: number) => void;
  onDone: () => void;
};

/** Пройти total шагов порциями по времени; вернёт «остановить». */
export function runSliced(total: number, step: (i: number) => void, o: SliceOptions): () => void {
  let i = 0;
  let stopped = false;
  let handle: unknown;
  const run = () => {
    if (stopped) return;
    const t0 = o.now();
    while (i < total) {
      step(i++);
      if ((i & 15) === 0 && o.now() - t0 >= o.budgetMs) break;
    }
    o.onSlice?.(i);
    if (i < total) {
      handle = o.schedule(run);
      return;
    }
    stopped = true;
    o.onDone();
  };
  handle = o.schedule(run);
  return () => {
    stopped = true;
    o.unschedule?.(handle);
  };
}

/**
 * Нарисовать клетки в surface порциями по кадрам. null — холст не дал
 * контекст (память графики кончилась): рисовать некуда.
 */
export function startAtlas(o: {
  surface: HTMLCanvasElement;
  geometry: TerrainGeometry;
  /** Местность клетки по номеру в geometry.cells. */
  terrain: ReadonlyArray<string | undefined>;
  images: Map<string, HTMLImageElement>;
  budgetMs: number;
  onSlice?: (done: number) => void;
  onDone: () => void;
}): (() => void) | null {
  const g = o.surface.getContext("2d");
  if (!g) return null;
  const tiles = new HexTileCache();
  const hex = hexPath2D();
  const density = o.surface.width / 320;
  const s = o.geometry.scale * density;
  const stop = runSliced(
    o.geometry.cells.length,
    (i) => {
      const p = o.geometry.fit(o.geometry.cells[i]);
      g.setTransform(s, 0, 0, s, p.x * density, p.y * density);
      const id = o.terrain[i];
      const cell = o.geometry.cells[i];
      let q: number | undefined, r: number | undefined;
      if (id && o.images.has(id + ':sparse')) [q, r] = cell.key.split(',').map(Number);
      const tile = id ? tiles.get(id, o.images.get(id), q, r) : null;
      if (tile) g.drawImage(tile, -TILE_DRAW_W / 2, -TILE_DRAW_H / 2, TILE_DRAW_W, TILE_DRAW_H);
      else {
        g.fillStyle = "#34483d";
        g.fill(hex);
      }
      g.strokeStyle = "rgba(18,30,24,.25)";
      g.lineWidth = 1;
      g.stroke(hex);
    },
    {
      budgetMs: o.budgetMs,
      now: () => performance.now(),
      schedule: (run) => requestAnimationFrame(run),
      unschedule: (h) => cancelAnimationFrame(h as number),
      onSlice: o.onSlice,
      onDone: () => {
        tiles.clear();
        o.onDone();
      },
    },
  );
  return () => {
    stop();
    tiles.clear();
  };
}

export type ImageLoad = { promise: Promise<HTMLImageElement | null>; abort: () => void };

/** Картинка плитки; null — не загрузилась за 15 с или с ошибкой. */
export function loadTerrainImage(url: string, timeoutMs = 15000): ImageLoad {
  const img = new Image();
  let finish: (ok: boolean) => void = () => {};
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    let done = false;
    const timer = setTimeout(() => finish(false), timeoutMs);
    finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      img.onload = img.onerror = null;
      resolve(ok ? img : null);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
  return { promise, abort: () => finish(false) };
}
