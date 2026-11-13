// Карта в памяти телефона: семь колонок чисел и плотная сетка — без объекта
// на клетку.
//
// Раньше карта разворачивалась в словарь из 82 172 объектов по строковому
// ключу «q,r» (16 МБ) плюс 82 172 записи индекса отрисовки с сортировкой
// (ещё ~8 МБ), и всё это пересобиралось на каждое обновление, а старые
// поколения не отпускались. Здесь те же колонки, что пришли по сети
// (Int16Array-виды на буфер снимка), сетка «q,r → номер клетки» на 0,46 МБ и
// координаты центров — и всё. Клетка как объект (Cell) собирается на лету,
// только когда её спрашивают по ключу (тап, соседи, поиск пути — единицы
// обращений), а кадр читает колонки напрямую по номеру.
//
// Сетка и координаты кэшируются по ссылке на колонки q/r: правка кистью или
// дельта клонирует только тронутые колонки (packedEdit), q/r остаются теми
// же — и сетку пересобирать не надо.
import { axialToPixel } from "./hexGeometry";
import type { Cell, PackedCells } from "./unpackMap";
import { makeCellsProxy } from "./mapCellsProxy";
import { roadMasksOf } from "./mapRoadMasks";
import { syncVeins } from "./veinStore";

export { STORE, storeOf } from "./mapCellsProxy";

type Col = ArrayLike<number>;

type Geometry = {
  q: Col;
  r: Col;
  minQ: number;
  minR: number;
  cols: number;
  rows: number;
  /** (r - minR) * cols + (q - minQ) → номер клетки, -1 — нет клетки. */
  grid: Int32Array;
  /** Центры гексов в мировых пикселях (до камеры). */
  x: Float32Array;
  y: Float32Array;
  /** Точка отсчёта сетки (axialToPixel): по ней строка r считается из y. */
  centerQ: number;
  c0q: number;
  /** Рамка карты в мировых пикселях — по центрам крайних клеток. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Ключи «q,r» по номеру клетки — лениво; общие для всех снимков с этими колонками. */
  keys: string[];
};

const geometries = new WeakMap<object, Geometry>();

function geometryOf(p: PackedCells, centerQ: number, c0q: number): Geometry {
  // Ключ — сама колонка q: типизированный массив или number[] — объект.
  const key = p.q as unknown as object;
  const hit = geometries.get(key);
  if (hit && hit.r === p.r && hit.centerQ === centerQ && hit.c0q === c0q) return hit;
  const n = p.q.length;
  let minQ = Infinity;
  let maxQ = -Infinity;
  let minR = Infinity;
  let maxR = -Infinity;
  for (let i = 0; i < n; i++) {
    const q = p.q[i];
    const r = p.r[i];
    if (q < minQ) minQ = q;
    if (q > maxQ) maxQ = q;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
  }
  if (n === 0) {
    minQ = minR = 0;
    maxQ = maxR = -1;
  }
  const cols = Math.max(1, maxQ - minQ + 1);
  const rows = Math.max(1, maxR - minR + 1);
  const grid = new Int32Array(cols * rows).fill(-1);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    grid[(p.r[i] - minR) * cols + (p.q[i] - minQ)] = i;
    const px = axialToPixel(p.q[i], p.r[i], centerQ, c0q);
    x[i] = px.x;
    y[i] = px.y;
    if (px.x < x0) x0 = px.x;
    if (px.x > x1) x1 = px.x;
    if (px.y < y0) y0 = px.y;
    if (px.y > y1) y1 = px.y;
  }
  if (n === 0) x0 = x1 = y0 = y1 = 0;
  const g: Geometry = {
    q: p.q,
    r: p.r,
    minQ,
    minR,
    cols,
    rows,
    grid,
    x,
    y,
    centerQ,
    c0q,
    x0,
    x1,
    y0,
    y1,
    keys: new Array<string>(n),
  };
  geometries.set(key, g);
  return g;
}

export class MapStore {
  readonly packed: PackedCells;
  readonly n: number;
  readonly geom: Geometry;
  readonly dead: Set<number>;
  readonly runners: Set<number>;
  readonly dome: Set<number>;
  /** Клетка-ратуша → её координаты: тап по ней открывает окно города. */
  readonly hallByIdx: Map<number, { q: number; r: number }>;
  /** Клетки с шахтой: стена для героя (hexPassable). */
  readonly mines: Set<number>;
  readonly bypassVoid: boolean;
  /** Готовые ключи тайлов местности по индексу словаря ("t:<id>"). */
  readonly tileKeys: string[];
  /** Ключи «q,r» — считаются лениво, только для спрошенных клеток. */
  private readonly keyCache: string[];
  /** Битовая маска дорог: бит на направление ROAD_DIRS. */
  private roadMasks: Uint8Array | null = null;
  /** Словарь по ключу — Proxy поверх колонок, для старого кода. */
  readonly cells: Record<string, Cell>;

  constructor(packed: PackedCells, centerQ: number, c0q: number, bypassVoid: boolean) {
    this.packed = packed;
    this.n = packed.q.length;
    this.geom = geometryOf(packed, centerQ, c0q);
    this.dead = new Set(packed.defeated);
    this.runners = new Set(packed.runners ?? []);
    this.dome = bypassVoid ? new Set() : new Set(packed.voidFog ?? []);
    this.mines = new Set(packed.mines ?? []);
    this.bypassVoid = bypassVoid;
    this.hallByIdx = new Map();
    for (const i of packed.townHalls ?? [])
      this.hallByIdx.set(i, { q: packed.q[i], r: packed.r[i] });
    this.tileKeys = packed.terrainIds.map((id) => "t:" + id);
    this.keyCache = this.geom.keys; // событие карты — новый store, но ключи те же: не пересобираем
    this.cells = makeCellsProxy(this);
    syncVeins(packed); // жилы этой карты — ответ veinAt(q, r)
  }

  /** Номер клетки по координатам; -1 — такой клетки нет. */
  index(q: number, r: number): number {
    const g = this.geom;
    const cx = q - g.minQ;
    const cy = r - g.minR;
    if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return -1;
    return g.grid[cy * g.cols + cx];
  }

  indexOfKey(key: string): number {
    const comma = key.indexOf(",");
    if (comma < 0) return -1;
    const q = Number(key.slice(0, comma));
    const r = Number(key.slice(comma + 1));
    return Number.isFinite(q) && Number.isFinite(r) ? this.index(q, r) : -1;
  }

  key(i: number): string {
    let k = this.keyCache[i];
    if (k === undefined) {
      k = `${this.packed.q[i]},${this.packed.r[i]}`;
      this.keyCache[i] = k;
    }
    return k;
  }

  terrainId(i: number): string | undefined {
    const t = this.packed.t[i];
    return t >= 0 ? this.packed.terrainIds[t] : undefined;
  }

  objectId(i: number): string | undefined {
    const o = this.packed.obj[i];
    return o >= 0 ? this.packed.objectIds[o] : undefined;
  }

  roadId(i: number): string | undefined {
    const rd = this.packed.road[i];
    return rd >= 0 ? this.packed.roadIds[rd] : undefined;
  }

  decorationId(i: number): string | undefined {
    const d = this.packed.dec[i];
    return d >= 0 ? this.packed.decorationIds[d] : undefined;
  }

  buildingId(i: number): string | undefined {
    const b = this.packed.bld?.[i] ?? -1;
    return b >= 0 ? (this.packed.buildingIds?.[b] ?? undefined) : undefined;
  }

  /** Клетка как объект — та же форма, что у unpackCells. */
  cellAt(i: number): Cell {
    return this.cellInto(i, {});
  }

  /** То же в переданный объект (перебор всех клеток без аллокаций). */
  cellInto(i: number, cell: Cell): Cell {
    const p = this.packed;
    cell.terrainId = undefined;
    cell.roadId = undefined;
    cell.objectId = undefined;
    cell.objectDefeated = undefined;
    cell.runner = undefined;
    cell.decorationId = undefined;
    cell.buildingId = undefined;
    cell.voidFog = undefined;
    cell.townHall = undefined;
    cell.mine = undefined;
    const t = p.t[i];
    if (t >= 0) cell.terrainId = p.terrainIds[t];
    const road = p.road[i];
    if (road >= 0) cell.roadId = p.roadIds[road];
    const obj = p.obj[i];
    if (obj >= 0) {
      cell.objectId = p.objectIds[obj];
      if (this.dead.has(i)) cell.objectDefeated = true;
      if (this.runners.has(i)) cell.runner = true;
    }
    const dec = p.dec[i];
    if (dec >= 0) cell.decorationId = p.decorationIds[dec];
    const bld = p.bld?.[i] ?? -1;
    if (bld >= 0) cell.buildingId = p.buildingIds?.[bld] ?? null;
    if (this.dome.has(i)) cell.voidFog = true;
    const hall = this.hallByIdx.get(i);
    if (hall) cell.townHall = hall;
    if (this.mines.has(i)) cell.mine = true;
    return cell;
  }

  /** Маска соседей с ТОЙ ЖЕ дорогой (roadRibbonCache) — считается один раз. */
  roadMask(i: number): number {
    if (!this.roadMasks) this.roadMasks = roadMasksOf(this);
    return this.roadMasks[i];
  }
}
