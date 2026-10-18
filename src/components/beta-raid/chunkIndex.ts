// Нумерация кусков статичного слоя и учёт того, что в них устарело.
//
// Кусок — квадрат мировых координат со стороной CHUNK (не сетки q/r: гексы
// сдвигаются через ряд, и квадрат мира даёт канвас без пустых углов). Номер
// куска для клетки — целочисленное деление её центра, без поиска.
//
// Устаревание считается по источникам, а не «всё заново»: журнал маски
// тумана даёт номера свежеразведанных клеток, дельта карты — новые колонки
// местности/дорог/декора, которые сравниваем со старыми по номерам клеток. Сетка
// или купол сменились, включили раскрытие — сбрасываем всё.
import type { MapStore } from "./mapStore";
import type { FogMask } from "./fogMask";
import type { WorldView } from "./mapIndex";
import { R, ROAD_DIRS } from "./hexGeometry";
import { RIBBON_DRAW_H, RIBBON_DRAW_W } from "./roadRibbonCache";

/** Сторона куска в мировых пикселях (~8 колонок × 9 рядов гексов). */
export const CHUNK = 384;
/**
 * Шов: кусок печётся на столько мировых px шире квадрата с каждой стороны.
 * Соседи перекрываются полоской ОДИНАКОВЫХ пикселей — когда зум едет и кусок
 * ложится на холст с масштабом, сглаженный край drawImage не даёт щели.
 */
export const SEAM = 2;

/**
 * Насколько рисунок клетки выступает от её центра, мировые px: тайл и лента —
 * на полспрайта (x, y), декор — вверх до 4,5R (стоит на гексе, ширина 1,5R ×
 * пропорции картинки; 4,5R хватает картинкам до 1:3). По нему кусок решает,
 * какие клетки печь (chunkBake), а журнал — какие куски ронять (dropCell).
 */
export const REACH = { x: RIBBON_DRAW_W / 2, y: RIBBON_DRAW_H / 2, dec: R * 4.5 } as const;

export const chunkX = (x: number) => Math.floor(x / CHUNK);
export const chunkY = (y: number) => Math.floor(y / CHUNK);

/** Границы куска в мире — квадрат + шов: что кусок печёт и чем режет. */
export const chunkRect = (cx: number, cy: number): WorldView => ({
  minX: cx * CHUNK - SEAM,
  maxX: (cx + 1) * CHUNK + SEAM,
  minY: cy * CHUNK - SEAM,
  maxY: (cy + 1) * CHUNK + SEAM,
});

/** Один номер на кусок для наборов «накрыт ли кадром»: сдвиг убирает минус. */
export const chunkId = (cx: number, cy: number) => (cy + 32768) * 65536 + (cx + 32768);

type Seen = { hasIndex(i: number): boolean; mask?: FogMask | null };

export class ChunkIndex {
  private store: MapStore | null = null;
  private mask: FogMask | null = null;
  private cursor = 0;
  private revealAll = false;

  constructor(private readonly drop: (cx: number, cy: number) => void) {}

  reset(): void {
    this.store = null;
    this.mask = null;
    this.cursor = 0;
  }

  /**
   * Сверить источники с прошлым кадром и выбросить устаревшие куски.
   * Возвращает true, если пришлось сбросить всё.
   */
  sync(store: MapStore, seen: Seen, revealAll: boolean, clearAll: () => void): boolean {
    const prev = this.store;
    const mask = seen.mask ?? null;
    let cleared = false;
    if (
      !prev ||
      prev.geom !== store.geom ||
      prev.packed.voidFog !== store.packed.voidFog ||
      prev.bypassVoid !== store.bypassVoid ||
      this.revealAll !== revealAll ||
      this.mask !== mask
    ) {
      clearAll();
      cleared = true;
    } else if (prev !== store) {
      this.diffColumns(prev, store);
    }
    this.store = store;
    this.revealAll = revealAll;
    if (this.mask !== mask || cleared) {
      this.mask = mask;
      this.cursor = mask ? mask.log.length : 0;
      return cleared;
    }
    if (mask) {
      const added = mask.addedSince(this.cursor);
      this.cursor = mask.log.length;
      for (const i of added) this.dropCell(store, i);
    }
    return cleared;
  }

  /** Дельта карты: сравнить колонки местности, декора и дорог по номерам клеток. */
  private diffColumns(prev: MapStore, next: MapStore): void {
    const a = prev.packed;
    const b = next.packed;
    const n = Math.min(a.q.length, b.q.length);
    if (a.t !== b.t || a.terrainIds !== b.terrainIds) {
      for (let i = 0; i < n; i++) if (a.t[i] !== b.t[i]) this.dropCell(next, i);
    }
    if (a.dec !== b.dec || a.decorationIds !== b.decorationIds) {
      // Старое дерево тоже торчало вверх — ронять куски над клеткой и когда
      // декор сняли, а не только когда поставили.
      for (let i = 0; i < n; i++) if (a.dec[i] !== b.dec[i]) this.dropCell(next, i, true);
    }
    if (a.groups !== b.groups) {
      // Состав блоков сменился: декор их клеток то печётся в куске, то нет
      // (chunkBake) — роняем куски над всеми клетками старых и новых троек.
      for (const flat of [a.groups ?? [], b.groups ?? []])
        for (let k = 0; k + 2 < flat.length; k += 3)
          if (flat[k] < n) this.dropCell(next, flat[k], true);
    }
    if (a.road !== b.road || a.roadIds !== b.roadIds) {
      for (let i = 0; i < n; i++) {
        if (a.road[i] === b.road[i]) continue;
        this.dropCell(next, i);
        // Лента соседа сшивается по маске — у соседей она тоже другая. А срезка
        // ступеньки (roadPrune) смотрит и на соседей соседа — роняем два кольца.
        for (const d of ROAD_DIRS) {
          const qa = b.q[i] + d.q;
          const ra = b.r[i] + d.r;
          const j = next.index(qa, ra);
          if (j >= 0) this.dropCell(next, j);
          for (const e of ROAD_DIRS) {
            const k = next.index(qa + e.q, ra + e.r);
            if (k >= 0 && k !== i) this.dropCell(next, k);
          }
        }
      }
    }
  }

  /**
   * Уронить все куски, которых касается рисунок клетки, а не только кусок её
   * центра: кусок печёт каждую задевающую его клетку и режет её своим краем
   * (chunkBake), поэтому дерево у границы лежит в двух-четырёх кусках сразу.
   * Ронять один — у соседа остался бы чёрный край тайла или старая верхушка.
   * `tall` — считать вынос декора вверх (есть или был декор).
   */
  private dropCell(store: MapStore, i: number, tall = store.packed.dec[i] >= 0): void {
    const g = store.geom;
    const x = g.x[i];
    const y = g.y[i];
    const cx0 = chunkX(x - REACH.x - SEAM);
    const cx1 = chunkX(x + REACH.x + SEAM);
    const cy0 = chunkY(y - (tall ? REACH.dec : REACH.y) - SEAM);
    const cy1 = chunkY(y + REACH.y + SEAM);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.drop(cx, cy);
  }
}
