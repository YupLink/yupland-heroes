import { makePuddleTexture, puddleVariant } from "./weather/visuals/puddleTexture";
import { makeSnowTexture } from "./weather/visuals/snowTexture";
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
import { freeCanvas } from "./freeCanvas";
import { midgardWaterSparseImage, waterTileHasPadding } from "./world-art/midgardWater";

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
  private puddles=false;
  private puddleKeys?:ReadonlySet<string>;
  private puddleMasks=new Map<number,HTMLCanvasElement>();
  setPuddles(enabled:boolean,keys?:ReadonlySet<string>):boolean {
    const changed=enabled!==this.puddles||(enabled&&keys!==this.puddleKeys);
    this.puddleKeys=keys;
    if(!changed)return false;
    this.puddles=enabled;this.clear();
    this.puddleMasks.forEach(freeCanvas);this.puddleMasks.clear();
    return true;
  }
  private snowStage=0;
  private snowKeys?:ReadonlySet<string>;
  private snow:HTMLCanvasElement|null=null;
  setSnow(stage:number,keys?:ReadonlySet<string>):boolean {
    stage=Math.max(0,Math.min(4,Math.floor(stage)));
    const changed=stage!==this.snowStage||(stage>0&&keys!==this.snowKeys);
    this.snowKeys=keys;
    if(!changed)return false;
    this.clear();
    if(this.snow)freeCanvas(this.snow);
    this.snowStage=stage;
    this.snow=stage?makeSnowTexture(stage):null;
    return true;
  }

  /**
   * Тайл по ключу вида ("t:<id>"); null — картинка ещё не готова.
   * Ничего не кэшируем, пока картинка не догрузилась: иначе в кэше навсегда
   * осел бы пустой тайл.
   */
  get(key: string, img: HTMLImageElement | undefined, q?:number, r?:number): HTMLCanvasElement | null {
    const sparse = midgardWaterSparseImage(img, q, r);
    if (sparse) img = sparse;
    const variant=this.puddles&&this.puddleKeys?.has(key)&&q!==undefined&&r!==undefined?puddleVariant(q,r):0;
    const artKey=sparse?`${key}:water-sparse`:key;
    const cacheKey=variant?`${artKey}:puddle:${variant}`:artKey;
    const hit = this.tiles.get(cacheKey);
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
    // Expand only approved water while baking once; never in the animation loop.
    if (waterTileHasPadding(img)) g.scale((R + PAD) / R, (R + PAD) / R);
    g.clip(hexPath2D());
    g.drawImage(img, -(R * SQRT3) / 2, -R, R * SQRT3, R * 2);
    if(this.snow&&this.snowKeys?.has(key))
      g.drawImage(this.snow,-(R*SQRT3)/2,-R,R*SQRT3,R*2);
    if(variant){
      let mask=this.puddleMasks.get(variant);
      if(!mask){mask=makePuddleTexture(variant);this.puddleMasks.set(variant,mask)}
      g.drawImage(mask,-(R*SQRT3)/2,-R,R*SQRT3,R*2);
    }
    this.tiles.set(cacheKey, cv);
    return cv;
  }

  /** Забыть тайлы (смена карты или набора картинок). Зум и панорама — не повод. */
  clear(): void {
    this.tiles.forEach((cv) => freeCanvas(cv)); // память графики — сразу, не со сборкой мусора
    this.tiles.clear();
  }
}

// Рисуем чуть крупнее гекса — перекрытие убирает швы между соседними тайлами.
export const TILE_DRAW_W = R * SQRT3 + PAD * 2;
export const TILE_DRAW_H = R * 2 + PAD * 2;


