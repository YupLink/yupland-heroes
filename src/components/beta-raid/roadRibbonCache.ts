// Готовые спрайты дорожной ленты: картинка дороги, обрезанная по её силуэту.
//
// Сама ЛЕНТА прежняя — лучи от центра к серединам граней, где у соседа та же
// дорога, плюс узел в центре. Поменялся только способ: раньше её выкладывал
// каждый кадр (до шести stroke, arc, fill, save/restore и createPattern на
// дорогу — около двадцати вызовов канваса на клетку), теперь она печётся один
// раз на сочетание «дорога + маска соседей», а кадр кладёт готовое одним
// drawImage. Так же живут тайлы местности (hexTileCache) и купол (voidTile).
//
// Силуэт РЕЖЕТ картинку, а не повторяет её плиткой: на ленте виден фрагмент
// самого рисунка дороги, вписанного в габарит клетки, — ровно как у местности
// виден фрагмент её тайла. Прежний createPattern("repeat") вместо рисунка
// давал мелкую мозаику из него же.
import { R, ROAD_DIRS, SQRT3 } from "./hexGeometry";
import { TILE_DRAW_H, TILE_DRAW_W, TILE_SCALE } from "./hexTileCache";
import { COLOR } from "./betaCanvasScene";

/** Ширина ленты — та же, что рисовалась покадрово: лента, а не гекс. */
const WIDTH = Math.max(2, R * 0.26);

/**
 * Луч бьёт ровно в середину грани и ни на пиксель дальше — это принципиально.
 *
 * Клетки рисуются по одной, и притемнение «разведано, но вне обзора» ложится на каждую отдельно: всё, что
 * лента вынесла за свою грань, попадает на уже притемнённого соседа НЕ
 * притемнённым — светлой отметиной ровно на стыке. Круглый торец выносил за
 * грань 3,6 px, и отметина читалась бусиной (замер: яркость 165 против 87 у
 * самой ленты, полоса в три пикселя на каждом стыке).
 *
 * Щели от этого не возникает: срезы соседей встают встык. Проверено на боевой
 * карте — с перехлёстом и без него профиль ленты в режиме админа (где
 * притемнения нет вовсе) совпадает пиксель в пиксель.
 *
 * Куда бьют лучи: середина грани = половина смещения до центра соседа.
 * Считается из ROAD_DIRS, чтобы порядок битов маски и порядок лучей не могли
 * разъехаться.
 */
const RAYS = ROAD_DIRS.map((d) => ({
  x: (R * SQRT3 * (d.q + d.r / 2)) / 2,
  y: (R * 1.5 * d.r) / 2,
}));

/**
 * Запас по краям спрайта — только под сглаживание среза. Раньше он был в
 * полширины ленты, потому что круглый торец вылезал за грань полукругом; с
 * торцом butt лента целиком помещается в габарит гекса.
 */
const PAD = 1;

export const RIBBON_DRAW_W = TILE_DRAW_W + PAD * 2;
export const RIBBON_DRAW_H = TILE_DRAW_H + PAD * 2;

/**
 * Потолок кэша спрайтов. Сочетаний «дорога + маска» на живой карте пара
 * десятков, но эталон — Xiaomi 13T в вебвью Telegram, а спрайт весит около
 * 50 КБ пикселей. Вытеснение — по старшинству закладки: на реальной карте до
 * него не доходит.
 */
const MAX_SPRITES = 256;

/**
 * Спрайты лент. Ключ — «дорога + маска соседей»: у одной дороги их не больше
 * 64 (шесть направлений), а на живой карте набирается пара десятков — дорога
 * идёт линией, и у клетки почти всегда один-два соседа.
 *
 * Масштаба в ключе нет намеренно: он константа TILE_SCALE, общая с тайлами
 * местности. Появится второй — добавить его сюда, иначе спрайты разных
 * разрешений подменят друг друга.
 */
export class RoadRibbonCache {
  private sprites = new Map<string, HTMLCanvasElement>();

  /**
   * Спрайт ленты; null — печь нечем (картинка ещё летит или нет документа).
   *
   * `img` не передан вовсе (у дороги нет PNG — старые id вроде "road") —
   * печём ленту запасным цветом: карта не обязана ждать художника.
   */
  get(roadId: string, mask: number, img: HTMLImageElement | undefined): HTMLCanvasElement | null {
    const key = roadId + ":" + mask;
    const hit = this.sprites.get(key);
    if (hit) return hit;
    // Картинка есть, но ещё не догрузилась — НЕ печём: иначе в кэше навсегда
    // осел бы одноцветный спрайт и PNG на карте так и не появился бы.
    if (img && !(img.complete && img.naturalWidth > 0)) return null;
    const cv = bake(mask, img);
    if (cv) {
      this.sprites.set(key, cv);
      if (this.sprites.size > MAX_SPRITES) {
        const oldest = this.sprites.keys().next();
        if (!oldest.done) this.sprites.delete(oldest.value);
      }
    }
    return cv;
  }

  /** Забыть спрайты (смена карты или набора картинок). Зум и панорама — нет. */
  clear(): void {
    this.sprites.clear();
  }
}

/** Выпечка одного спрайта: сначала силуэт ленты, потом картинка сквозь него. */
function bake(mask: number, img: HTMLImageElement | undefined): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(RIBBON_DRAW_W * TILE_SCALE);
  cv.height = Math.ceil(RIBBON_DRAW_H * TILE_SCALE);
  const g = cv.getContext("2d");
  if (!g) return null;

  g.setTransform(TILE_SCALE, 0, 0, TILE_SCALE, 0, 0);
  g.translate(RIBBON_DRAW_W / 2, RIBBON_DRAW_H / 2);

  // Полоса-отрезок (мостовая 1280×258) кладётся вдоль каждого отрезка целиком.
  if (img && isStrip(img)) {
    bakeStrip(g, mask, img);
    return cv;
  }

  // 1. Силуэт. Цвет тут важен только для дорог без PNG: под картинкой от него
  // останется одна альфа — по ней и режется рисунок.
  g.strokeStyle = COLOR.road;
  g.fillStyle = COLOR.road;
  g.lineWidth = WIDTH;
  // Торец «butt»: луч перпендикулярен грани, срез ложится ровно вдоль неё и
  // встречается со срезом соседа встык. Прежний «round» дорисовывал за гранью
  // полукруг — он и вздувался узлом на каждом стыке.
  g.lineCap = "butt";
  for (let i = 0; i < RAYS.length; i++) {
    if ((mask & (1 << i)) === 0) continue;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(RAYS[i].x, RAYS[i].y);
    g.stroke();
  }
  // Узел в центре — ровно по ширине ленты: он закрывает выемку между лучами,
  // сходящимися под углом, и виден только там, где дорога поворачивает. Прежние
  // W * 0.8 для одинокой клетки давали утолщение в полторы ширины ленты.
  g.beginPath();
  g.arc(0, 0, WIDTH / 2, 0, Math.PI * 2);
  g.fill();

  // 2. Картинка сквозь силуэт: source-in оставляет её ровно там, где силуэт
  // непрозрачен. Это и есть «обрезать изображение по заготовленной форме».
  if (img) {
    g.globalCompositeOperation = "source-in";
    drawCover(g, img);
  }
  return cv;
}

/**
 * Вписать картинку в габарит спрайта БЕЗ искажения пропорций (cover): лишнее
 * уходит за край, центр остаётся в центре.
 *
 * Раньше картинка растягивалась на коробку как есть, и полоса мостовой 1280×258
 * сплющивалась в пять раз — узор превращался в серый шум, по которому одну
 * дорогу от другой не отличить. Cover, а не contain: пустых полей на ленте
 * быть не должно, иначе сквозь неё просвечивала бы местность.
 */
function drawCover(g: CanvasRenderingContext2D, img: HTMLImageElement): void {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const k = Math.max(RIBBON_DRAW_W / iw, RIBBON_DRAW_H / ih);
  const w = iw * k;
  const h = ih * k;
  g.drawImage(img, -w / 2, -h / 2, w, h);
}

/**
 * Полоса шире 2,5:1 — это рисунок ОТРЕЗКА дороги «центр клетки → центр соседа»
 * (владелец, 09.10.2026: «для каждого участка между клетками — то, что
 * скинул»; мостовая 1280×258 из пяти плиток). Квадратные картинки (песок, лёд)
 * по-прежнему режутся силуэтом ленты.
 */
const STRIP_RATIO = 2.5;
const isStrip = (img: HTMLImageElement) => img.naturalWidth >= img.naturalHeight * STRIP_RATIO;

/** Отрезок между центрами соседних клеток; луч клетки — его половина. */
const SEGMENT = R * SQRT3;

/**
 * Отрезок рисуют две клетки, каждая свою половину до середины грани. Обе
 * кладут полосу в системе ПРЯМОГО направления (лучи 0–2): клетка-начало —
 * левую половину картинки от своего центра, клетка-конец (лучи 3–5) — правую,
 * от грани к своему центру. На грани половины сходятся встык, без зеркала, и
 * между центрами видна вся полоса.
 */
function bakeStrip(g: CanvasRenderingContext2D, mask: number, img: HTMLImageElement): void {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const half = SEGMENT / 2;
  // Ширина — по пропорциям полосы: у мостовой ≈ 0,35 клетки.
  const w = Math.max(WIDTH, (SEGMENT * ih) / iw);
  g.imageSmoothingQuality = "high";
  // Узел — кружок из середины полосы: закрывает выемку на поворотах.
  g.save();
  g.beginPath();
  g.arc(0, 0, w / 2, 0, Math.PI * 2);
  g.clip();
  g.drawImage(img, iw / 2 - ih / 2, 0, ih, ih, -w / 2, -w / 2, w, w);
  g.restore();
  for (let i = 0; i < RAYS.length; i++) {
    if ((mask & (1 << i)) === 0) continue;
    const forward = i < 3;
    const ray = RAYS[forward ? i : i - 3];
    g.save();
    g.rotate(Math.atan2(ray.y, ray.x));
    g.drawImage(img, forward ? 0 : iw / 2, 0, iw / 2, ih, forward ? 0 : -half, -w / 2, half, w);
    g.restore();
  }
}
