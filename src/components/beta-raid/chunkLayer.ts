// Статичный слой карты кусками: местность + дорога + декор + чёрный
// неразведанный туман испечены в offscreen-канвасы по 384×384 мировых
// пикселей, кадр кладёт видимые куски одним drawImage каждый вместо
// одного-трёх на КАЖДУЮ клетку (при отдалении — тысячи вызовов за кадр;
// замер: 336 масштабируемых картинок декора = 34–66 мс кадра на телефоне ×4,
// 12 кусков 1:1 — в пределах 16 мс).
//
// Кусок живёт, пока не изменилось то, из чего он испечён: клетка разведана
// (журнал маски тумана), админ перекрасил местность, дорогу или декор
// (дельта колонок), сменилась сетка карты. Объекты, постройки, корабли,
// лагеря его не трогают — они рисуются поверх, покадрово, как и раньше.
// Порядок слоёв внутри куска — тот же, что был в кадре: клетки сверху вниз,
// в клетке местность → дорога → декор.
//
// Канвас куска — ровно его квадрат плюс шов (chunkRect), без запасов под
// вынос рисунка: в кусок печётся всё, что его задевает, и режется его краем
// (chunkBake). Запасы были — и соседние канвасы перекрывались, а кусок,
// положенный позже, накрывал тайлами верхушки деревьев из запаса соседа.
//
// Разрешение — РОВНО текущий зум × плотность экрана (до потолка), а начало
// куска подогнано к целому пикселю устройства: кусок ложится на холст без
// пересчёта пикселей (1:1). Это важно там, где холст растеризуется
// процессором (WebView без ускорения): масштабируемый drawImage большого
// источника стоит там как весь экран заново, а копия 1:1 — почти ничего.
// Пока зум едет, новых кусков не печём — старые ложатся с масштабом, а
// после остановки допекаются под новый зум. Память — LRU по байтам.
import type { MapIndex } from "./mapIndex";
import type { HexTileCache } from "./hexTileCache";
import { bakeCells, imgReady } from "./chunkBake";
import type { RoadRibbonCache } from "./roadRibbonCache";
import { ChunkIndex, CHUNK, SEAM, chunkId, chunkRect } from "./chunkIndex";

/**
 * Потолок памяти под куски: суммарно по всем разрешениям. Скромный нарочно:
 * канвасы живут в памяти графики телефона, а слабые Android в вебвью
 * Telegram закрываются молча, если её не хватает. Но НЕ меньше полутора
 * экранов: иначе куски кадра вытесняли бы друг друга и печься пришлось бы
 * каждый кадр без конца (drawStatic задаёт `need` — байты одного экрана).
 */
const BASE_BYTES = 16 * 1024 * 1024;
/**
 * Экран, которому нужно больше этого, статичный слой не получает вовсе
 * (огромный монитор на большом зуме) — клетки рисуются по одной, как раньше.
 */
export const HARD_BYTES = 64 * 1024 * 1024;
/** Выше этого разрешения кусок не печём (2,4 МБ на кусок) — рисуем с увеличением. */
const MAX_BUCKET = 2;
/** Сколько вытесненных канвасов держим под повторную выпечку. */
const POOL_MAX = 6;

export type Baked = {
  cv: HTMLCanvasElement;
  /** Пикселей устройства на мировой пиксель. */
  bucket: number;
  /** Начало куска в мировых координатах (подогнано к пикселю устройства). */
  x0: number;
  y0: number;
  /** Размер на холсте в мировых единицах: cv.width / bucket. */
  w: number;
  h: number;
  bytes: number;
  /** Порядковый номер последнего обращения — для вытеснения. */
  last: number;
  /** Ключи картинок, которых не хватило при выпечке: догрузятся — перепечём. */
  missing: string[];
};

export type BakeInput = {
  index: MapIndex;
  tiles: HexTileCache;
  ribbons: RoadRibbonCache;
  images: Map<string, HTMLImageElement>;
  seen: { hasIndex(i: number): boolean };
  revealAll: boolean;
};

export class ChunkLayer {
  /** Куски по номеру: у одного куска — по одному канвасу на разрешение. */
  private baked = new Map<number, Baked[]>();
  private bytes = 0;
  private tick = 0;
  /** Разрешение прошлого кадра: по нему drawStatic видит, что зум ещё едет. */
  lastBucket = -1;
  /** Сколько байт нужно кускам одного экрана — потолок не опускается ниже 1,5×. */
  need = 0;

  /**
   * Сторона канваса в пикселях устройства — одна на разрешение, чтобы пул
   * канвасов попадал в размер; +1 — начало куска снапается к пикселю вниз.
   */
  static sidePx(bucket: number): number {
    return Math.ceil((CHUNK + SEAM * 2) * bucket) + 1;
  }

  /** Байт в одном куске при этом разрешении. */
  static bytesPer(bucket: number): number {
    const side = ChunkLayer.sidePx(bucket);
    return side * side * 4;
  }
  /** Что изменилось с прошлого кадра — решает ChunkIndex. */
  readonly invalidation = new ChunkIndex((cx, cy) => this.drop(cx, cy));

  /** Разрешение под текущий зум и плотность экрана — ровно, до потолка. */
  static bucketFor(scale: number, dpr: number): number {
    return Math.min(MAX_BUCKET, scale * dpr);
  }

  /** Готовый кусок нужного разрешения; `any` — ближайшего, если нужного нет. */
  get(cx: number, cy: number, bucket: number, any: boolean): Baked | null {
    const list = this.baked.get(chunkId(cx, cy));
    if (!list) return null;
    let best: Baked | null = null;
    for (const b of list) {
      if (b.bucket === bucket) {
        best = b;
        break;
      }
      if (any && (!best || Math.abs(b.bucket - bucket) < Math.abs(best.bucket - bucket))) best = b;
    }
    if (best) best.last = ++this.tick;
    return best;
  }

  /** Кусок испечён без части картинок, а они уже подъехали. */
  stale(b: Baked, images: Map<string, HTMLImageElement>): boolean {
    for (const k of b.missing) if (imgReady(images.get(k))) return true;
    return false;
  }

  /** Испечь кусок (cx, cy) в разрешении bucket и положить в кэш. */
  bake(cx: number, cy: number, bucket: number, input: BakeInput): Baked | null {
    if (typeof document === "undefined") return null;
    // Начало — на целом пикселе устройства: тогда при том же зуме кусок
    // ложится на холст 1:1, без пересчёта пикселей.
    const rect = chunkRect(cx, cy);
    const x0 = Math.floor(rect.minX * bucket) / bucket;
    const y0 = Math.floor(rect.minY * bucket) / bucket;
    const side = ChunkLayer.sidePx(bucket);
    // Канвас — из пула вытесненных того же размера: новый канвас — это
    // выделение и обнуление мегабайтов памяти графики на каждую выпечку
    // (в профиле — setTransform/getContext на 20 % кадра после зума).
    const cv = this.takeCanvas(side, side);
    const g = cv.getContext("2d");
    if (!g) return null;
    g.setTransform(bucket, 0, 0, bucket, -x0 * bucket, -y0 * bucket);
    const missing = bakeCells(g, rect, input);
    const b: Baked = {
      cv,
      bucket,
      x0,
      y0,
      w: cv.width / bucket,
      h: cv.height / bucket,
      bytes: cv.width * cv.height * 4,
      last: ++this.tick,
      missing,
    };
    const id = chunkId(cx, cy);
    const list = this.baked.get(id) ?? [];
    const at = list.findIndex((o) => o.bucket === bucket);
    if (at >= 0) {
      this.bytes -= list[at].bytes;
      list[at] = b;
    } else list.push(b);
    this.baked.set(id, list);
    this.bytes += b.bytes;
    this.evict();
    return b;
  }

  private drop(cx: number, cy: number): void {
    const id = chunkId(cx, cy);
    const list = this.baked.get(id);
    if (!list) return;
    for (const b of list) {
      this.bytes -= b.bytes;
      this.recycle(b.cv);
    }
    this.baked.delete(id);
  }

  /** Пул вытесненных канвасов — под следующую выпечку того же размера. */
  private pool: HTMLCanvasElement[] = [];

  private takeCanvas(w: number, h: number): HTMLCanvasElement {
    const at = this.pool.findIndex((c) => c.width === w && c.height === h);
    if (at >= 0) {
      const cv = this.pool.splice(at, 1)[0];
      // Тот же размер заново — холст очищается без переразмещения памяти.
      cv.width = w;
      return cv;
    }
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    return cv;
  }

  private recycle(cv: HTMLCanvasElement): void {
    if (this.pool.length >= POOL_MAX) return;
    this.pool.push(cv);
  }

  /** Вытеснить самые давние куски, пока не уложимся в потолок. */
  private evict(): void {
    const cap = Math.max(BASE_BYTES, Math.ceil(this.need * 1.5));
    while (this.bytes > cap) {
      let oldestId = -1;
      let oldestAt = -1;
      let oldest = Infinity;
      for (const [id, list] of this.baked) {
        for (let k = 0; k < list.length; k++) {
          if (list[k].last < oldest) {
            oldest = list[k].last;
            oldestId = id;
            oldestAt = k;
          }
        }
      }
      if (oldestId < 0) return;
      const list = this.baked.get(oldestId);
      if (!list) return;
      this.bytes -= list[oldestAt].bytes;
      this.recycle(list[oldestAt].cv);
      list.splice(oldestAt, 1);
      if (list.length === 0) this.baked.delete(oldestId);
      if (this.tick - oldest < 1) return;
    }
  }

  clear(): void {
    this.pool.length = 0;
    this.baked.clear();
    this.bytes = 0;
    this.invalidation.reset();
  }

  /** Для проб нагрузки: сколько кусков и байт в кэше. */
  stats(): { chunks: number; mb: number } {
    let n = 0;
    for (const list of this.baked.values()) n += list.length;
    return { chunks: n, mb: Math.round(this.bytes / 1048576) };
  }
}
