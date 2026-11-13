// Видимые клетки кадра — арифметикой по сетке, без индекса и сортировки.
//
// Раньше индекс отрисовки был массивом из 82 172 объектов, отсортированным
// по y (9,6 мс на 16 тысяч клеток, ~60 мс на 82 тысячи, плюс 8 МБ на каждое
// обновление карты), а кадр искал в нём полосу бинарным поиском. Гексы стоят
// рядами: строка r = высота y, а диапазон q в строке считается из ширины
// экрана. Значит видимые клетки — это двойной цикл по r и q с обращением к
// сетке (mapStore): 0,06–0,07 мс на кадр в замере, ни одной аллокации.
//
// Порядок «сверху вниз» — рост r, внутри строки — рост q: нижний сосед
// рисуется позже и перекрывает верхнего, как и раньше.
//
// В колбэк отдаётся ОДИН многоразовый объект клетки: поля перезаписываются
// на каждой итерации, держать его дольше вызова нельзя.
import { R, SQRT3 } from "./hexGeometry";
import type { MapStore } from "./mapStore";
import { blockAt } from "./mergeBlocks";
import type { Cell } from "./unpackMap";

export type MapIndex = { store: MapStore };

export function buildMapIndex(store: MapStore): MapIndex {
  return { store };
}

/** Взгляд на клетку по её номеру — те же поля, что у Cell, без объекта. */
class CellView implements Cell {
  i = -1;
  constructor(private readonly s: MapStore) {}
  get terrainId(): string | undefined {
    return this.s.terrainId(this.i);
  }
  get roadId(): string | undefined {
    return this.s.roadId(this.i);
  }
  get objectId(): string | undefined {
    return this.s.objectId(this.i);
  }
  get objectDefeated(): boolean {
    return this.s.dead.has(this.i);
  }
  get runner(): boolean {
    return this.s.runners.has(this.i);
  }
  get decorationId(): string | undefined {
    return this.s.decorationId(this.i);
  }
  get buildingId(): string | undefined {
    return this.s.buildingId(this.i);
  }
  get voidFog(): boolean {
    return this.s.dome.has(this.i);
  }
  get townHall(): { q: number; r: number } | undefined {
    return this.s.hallByIdx.get(this.i);
  }
  get mine(): boolean {
    return this.s.mines.has(this.i);
  }
  get groupId(): string | undefined {
    return blockAt(this.s, this.i)?.gid;
  }
  get iconScale(): number | undefined {
    return blockAt(this.s, this.i)?.scale;
  }
}

export class SceneCell {
  /** Номер клетки в колонках. */
  i = -1;
  q = 0;
  r = 0;
  /** Мировые координаты центра гекса (до камеры). */
  x = 0;
  y = 0;
  readonly cell: CellView;
  constructor(private readonly s: MapStore) {
    this.cell = new CellView(s);
  }
  /** Ключ «q,r» — по требованию (кэшируется в store). */
  get key(): string {
    return this.s.key(this.i);
  }
  /** Ключ тайла местности ("t:<id>", "" — нет местности). */
  get tileKey(): string {
    const t = this.s.packed.t[this.i];
    return t >= 0 ? this.s.tileKeys[t] : "";
  }
  /** Биты соседей с той же дорогой (roadRibbonCache). */
  get roadMask(): number {
    return this.s.roadMask(this.i);
  }
}

export type WorldView = { minX: number; maxX: number; minY: number; maxY: number };

const scratch = new WeakMap<MapStore, SceneCell>();

/**
 * Пройти только по клеткам, попавшим в кадр, в порядке отрисовки. Без
 * промежуточного массива и без аллокаций — вызывается несколько раз на кадр.
 */
export function forEachVisible(index: MapIndex, view: WorldView, fn: (c: SceneCell) => void): void {
  const s = index.store;
  const g = s.geom;
  let c = scratch.get(s);
  if (!c) {
    c = new SceneCell(s);
    scratch.set(s, c);
  }
  const p = s.packed;
  // Строка r → y = 1.5·R·(r − c0q) (axialToPixel): границы строк — из высоты
  // экрана, с запасом в одну клетку.
  const rowH = 1.5 * R;
  const colW = R * SQRT3;
  const r0 = Math.max(g.minR, Math.floor(view.minY / rowH) + g.c0q - 1);
  const r1 = Math.min(g.minR + g.rows - 1, Math.ceil(view.maxY / rowH) + g.c0q + 1);
  for (let r = r0; r <= r1; r++) {
    const rowStart = (r - g.minR) * g.cols;
    // Внутри строки x = R√3·(q − centerQ + (r − c0q)/2): диапазон q — из
    // ширины экрана, с запасом в клетку; пустые ячейки сетки — -1.
    const shift = g.centerQ - (r - g.c0q) / 2;
    const qFrom = Math.max(g.minQ, Math.floor(view.minX / colW + shift) - 1);
    const qTo = Math.min(g.minQ + g.cols - 1, Math.ceil(view.maxX / colW + shift) + 1);
    for (let q = qFrom; q <= qTo; q++) {
      const i = g.grid[rowStart + (q - g.minQ)];
      if (i < 0) continue;
      const x = g.x[i];
      if (x < view.minX) continue;
      if (x > view.maxX) break;
      const y = g.y[i];
      if (y < view.minY || y > view.maxY) continue;
      c.i = i;
      c.cell.i = i;
      c.q = p.q[i];
      c.r = p.r[i];
      c.x = x;
      c.y = y;
      fn(c);
    }
  }
}
