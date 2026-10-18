// Карта мира на телефоне: ответ сервера → сетка, геометрия картинки, метки.
//
// Картинка карты — клетка на два пикселя в ширину и один в высоту, соседние
// строки сдвинуты на пиксель (полклетки): гекс-сетка ложится в обычную
// растровую картинку без дыр. Пропорции гекса возвращает отрисовка (KX в
// worldMapCamera). Вся «Мир Альфа» — картинка 654×345: меньше мегабайта
// памяти и один drawImage на кадр вместо ста тысяч гексов.
import {
  decodeRuns,
  WORLD_MARK_KINDS,
  type WorldMapMode,
  type WorldMapTerrain,
  type WorldMapWire,
  type WorldMarkKind,
} from "@/lib/raid/worldMapCodec";

/** Метка: постройка или мой клад — вид по WORLD_MARK_KINDS. */
export type WorldMapMarkPos = { kind: WorldMarkKind; q: number; r: number };

export type WorldMapModel = {
  mode: WorldMapMode;
  q0: number;
  r0: number;
  cols: number;
  rows: number;
  /** (r − r0)·cols + (q − q0) → значение местности, 0 — пусто. */
  grid: Uint16Array;
  terrains: WorldMapTerrain[];
  /** Клеток на значение местности (индекс = значение): порядок легенды. */
  counts: number[];
  /** Самый левый полустолбец (2q + r) среди клеток — ноль картинки по x. */
  hxMin: number;
  /** Размер картинки в пикселях. */
  imgW: number;
  imgH: number;
  marks: WorldMapMarkPos[];
};

/** Ответ сервера → модель. null — бега не сошлись с рамкой (битый ответ). */
export function worldMapModel(w: WorldMapWire): WorldMapModel | null {
  const size = w.cols * w.rows;
  const grid = size > 0 ? decodeRuns(w.runs, size) : new Uint16Array(0);
  if (!grid) return null;
  const counts: number[] = new Array(w.terrains.length + 1).fill(0);
  let hxMin = Infinity;
  let hxMax = -Infinity;
  for (let row = 0; row < w.rows; row++) {
    const r = w.r0 + row;
    const base = row * w.cols;
    for (let col = 0; col < w.cols; col++) {
      const v = grid[base + col];
      if (!v) continue;
      counts[v] = (counts[v] ?? 0) + 1;
      const hx = 2 * (w.q0 + col) + r;
      if (hx < hxMin) hxMin = hx;
      if (hx > hxMax) hxMax = hx;
    }
  }
  const marks: WorldMapMarkPos[] = [];
  // Незнакомый номер вида (ответ новее клиента) пропускаем, а не рисуем чем попало.
  for (let i = 0; i + 2 < w.marks.length; i += 3) {
    const kind = WORLD_MARK_KINDS[w.marks[i]];
    if (kind) marks.push({ kind, q: w.marks[i + 1], r: w.marks[i + 2] });
  }
  const empty = hxMin > hxMax;
  return {
    mode: w.mode,
    q0: w.q0,
    r0: w.r0,
    cols: w.cols,
    rows: w.rows,
    grid,
    terrains: w.terrains,
    counts,
    hxMin: empty ? 0 : hxMin,
    imgW: empty ? 0 : hxMax - hxMin + 2,
    imgH: empty ? 0 : w.rows,
    marks,
  };
}

/** Значение местности клетки (q, r); 0 — пусто или за рамкой. */
export function cellValue(m: WorldMapModel, q: number, r: number): number {
  const col = q - m.q0;
  const row = r - m.r0;
  if (col < 0 || row < 0 || col >= m.cols || row >= m.rows) return 0;
  return m.grid[row * m.cols + col];
}

/**
 * Местность в пиксели картинки (RGBA, imgW × imgH). Палитра — три байта на
 * значение (terrainColors.buildPalette). Пустое остаётся прозрачным: под ним
 * фон карты. Один проход по сетке — ~110 тысяч клеток за пару миллисекунд.
 */
export function paintTerrain(m: WorldMapModel, palette: Uint8Array, px: Uint8ClampedArray): void {
  px.fill(0);
  const stride = m.imgW * 4;
  for (let row = 0; row < m.rows; row++) {
    const r = m.r0 + row;
    const base = row * m.cols;
    const line = row * stride;
    for (let col = 0; col < m.cols; col++) {
      const v = m.grid[base + col];
      if (!v) continue;
      const o = line + (2 * (m.q0 + col) + r - m.hxMin) * 4;
      const c = v * 3;
      const red = palette[c];
      const green = palette[c + 1];
      const blue = palette[c + 2];
      px[o] = red;
      px[o + 1] = green;
      px[o + 2] = blue;
      px[o + 3] = 255;
      px[o + 4] = red;
      px[o + 5] = green;
      px[o + 6] = blue;
      px[o + 7] = 255;
    }
  }
}
