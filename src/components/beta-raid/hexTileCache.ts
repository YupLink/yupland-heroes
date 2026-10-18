// Готовые гекс-тайлы местности.
//
// Каждая клетка местности рисовалась через save + clip(гекс) + drawImage +
// restore. При сотнях видимых клеток clip — самая дорогая часть кадра.
// Здесь картинка один раз обрезается по гексу в offscreen-канвас, а кадр
// потом просто кладёт готовый тайл одним drawImage.
//
// Ключ — с префиксом вида ("t:<id>"), тем же, что у кэша картинок
// (useImageCache): ключ картинки и ключ тайла тогда совпадают буквально.
//
// Дорога сюда НЕ ходит: она лента, а не гекс, и печётся своей формой —
// roadRibbonCache.ts. Общее у них только разрешение выпечки (TILE_SCALE).
import { R, SQRT3, hexPath2D } from "./hexGeometry";

/**
 * Разрешение тайла: гекс на экране мельче, запас — под зум и ретину.
 * Наружу — чтобы тайл непроходимого тумана (voidTile.ts) пёкся в том же
 * масштабе: иначе рядом лежали бы тайлы разной чёткости.
 */
export const TILE_SCALE = 2;
// Запас +1 пиксель (в логических координатах) с каждой стороны — тайлы соседних
// гексов слегка перекрываются, и субпиксельные швы между ними не видны.
const PAD = 1;
const TILE_W = Math.ceil((R * SQRT3 + PAD * 2) * TILE_SCALE);
const TILE_H = Math.ceil((R * 2 + PAD * 2) * TILE_SCALE);

export class HexTileCache {
  private tiles = new Map<string, HTMLCanvasElement>();

  /**
   * Тайл по ключу вида ("t:<id>"); null — картинка ещё не готова.
   * Ничего не кэшируем, пока картинка не догрузилась: иначе в кэше навсегда
   * осел бы пустой тайл.
   */
  get(key: string, img: HTMLImageElement | undefined): HTMLCanvasElement | null {
    const hit = this.tiles.get(key);
    if (hit) return hit;
    if (!img || !img.complete || img.naturalWidth === 0) return null;

    const cv = document.createElement("canvas");
    cv.width = TILE_W;
    cv.height = TILE_H;
    const g = cv.getContext("2d");
    if (!g) return null;
    g.setTransform(TILE_SCALE, 0, 0, TILE_SCALE, 0, 0);
    // Центр тайла — с учётом запаса PAD.
    g.translate(R * SQRT3 * 0.5 + PAD, R + PAD);
    g.clip(hexPath2D());
    g.drawImage(img, -(R * SQRT3) / 2, -R, R * SQRT3, R * 2);
    this.tiles.set(key, cv);
    return cv;
  }

  /** Забыть тайлы (смена карты или набора картинок). Зум и панорама — не повод. */
  clear(): void {
    this.tiles.clear();
  }
}

// Рисуем чуть крупнее гекса — перекрытие убирает швы между соседними тайлами.
export const TILE_DRAW_W = R * SQRT3 + PAD * 2;
export const TILE_DRAW_H = R * 2 + PAD * 2;
