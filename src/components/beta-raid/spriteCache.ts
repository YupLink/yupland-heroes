// Спрайты под текущий зум: иконка объекта/постройки/охранника один раз
// печётся в канвас РОВНО того размера, в каком её видно на экране, и кадр
// кладёт её 1:1 на целый пиксель. Никаких «фигурок вместо иконок» на
// отдалении: иконки те же, просто заранее уменьшенные.
//
// Замер (Chrome, CPU ×4, 336 иконок за кадр): масштабируемый drawImage
// картинки — 34–66 мс, спрайт 1:1 на целом пикселе — 17 мс (ImageBitmap) /
// 33 мс (канвас). Поэтому канвас после выпечки переводится в ImageBitmap, где
// он есть.
//
// Ключ спрайта включает разрешение (bucket = зум × dpr): сменился зум —
// пекутся новые, старые уходят по LRU. Память: 123 вида объектов × кольца ×
// 40×40 px — единицы мегабайт.
export type Sprite = {
  img: CanvasImageSource;
  /** Размер на холсте в мировых единицах — с ним спрайт ложится 1:1. */
  w: number;
  h: number;
  last: number;
};

const MAX_SPRITES = 600;
/**
 * Мастер-копия иконки печётся один раз на объект в разрешении 2 px на
 * мировую единицу (как тайлы): это дорогая часть (обрезка кругом, кольца).
 * Спрайт под конкретный зум — быстрое уменьшение мастера (без обрезки), и
 * пока его нет, мастер рисуется напрямую с масштабом — тоже без обрезки.
 */
const MASTER_BUCKET = 2;
/** Сколько мастеров (дорого, ~1 мс каждый на слабом телефоне) и спрайтов (дёшево) печём за кадр. */
const MASTERS_PER_FRAME = 32;
const SPRITES_PER_FRAME = 32;

export class SpriteCache {
  private sprites = new Map<string, Sprite>();
  private masters = new Map<string, Sprite>();
  private tick = 0;
  private mastersThisFrame = 0;
  private spritesThisFrame = 0;

  /** Начало кадра: обнулить счётчики выпечки. */
  beginFrame(): void {
    this.mastersThisFrame = 0;
    this.spritesThisFrame = 0;
  }

  /** Мастер-копия по ключу (печётся paint-ом); null — лимит кадра исчерпан. */
  master(
    key: string,
    wWorld: number,
    hWorld: number,
    paint: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  ): Sprite | null {
    const hit = this.masters.get(key);
    if (hit) return hit;
    if (this.mastersThisFrame >= MASTERS_PER_FRAME) return null;
    const made = bake(MASTER_BUCKET, wWorld, hWorld, paint);
    if (!made) return null;
    this.mastersThisFrame++;
    const sprite: Sprite = { img: made, w: wWorld, h: hWorld, last: ++this.tick };
    this.masters.set(key, sprite);
    toBitmap(made, (bm) => {
      if (this.masters.get(key) === sprite) sprite.img = bm;
    });
    return sprite;
  }

  /**
   * Спрайт по ключу; нет — печётся `paint`-ом в канвас размером
   * wWorld×hWorld мировых единиц при разрешении bucket. `paint` рисует в
   * мировых координатах от (0,0) до (wWorld,hWorld).
   */
  get(
    key: string,
    bucket: number,
    wWorld: number,
    hWorld: number,
    paint: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  ): Sprite | null {
    const k = `${key}|${bucket}`;
    const hit = this.sprites.get(k);
    if (hit) {
      hit.last = ++this.tick;
      return hit;
    }
    // Сначала мастер: под зум спрайт делается из него быстрым уменьшением.
    const m = this.master(key, wWorld, hWorld, paint);
    if (!m) return null;
    if (this.spritesThisFrame >= SPRITES_PER_FRAME) {
      // Лимит кадра: отдаём мастер как есть — кадр нарисует его с масштабом.
      return m;
    }
    const made = bake(bucket, wWorld, hWorld, (g, w, h) => g.drawImage(m.img, 0, 0, w, h));
    if (!made) return m;
    this.spritesThisFrame++;
    const sprite: Sprite = {
      img: made,
      w: made.width / bucket,
      h: made.height / bucket,
      last: ++this.tick,
    };
    this.sprites.set(k, sprite);
    toBitmap(made, (bm) => {
      if (this.sprites.get(k) === sprite) sprite.img = bm;
    });
    if (this.sprites.size > MAX_SPRITES) this.evict();
    return sprite;
  }

  /** Положить спрайт центром в (x, y) — на целый пиксель устройства. */
  draw(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, bucket: number): void {
    const x0 = Math.round((x - s.w / 2) * bucket) / bucket;
    const y0 = Math.round((y - s.h / 2) * bucket) / bucket;
    g.drawImage(s.img, x0, y0, s.w, s.h);
  }

  /** То же, но с якорем по нижнему краю (постройка «стоит» на гексе). */
  drawBottom(
    g: CanvasRenderingContext2D,
    s: Sprite,
    x: number,
    bottom: number,
    bucket: number,
  ): void {
    const x0 = Math.round((x - s.w / 2) * bucket) / bucket;
    const y0 = Math.round((bottom - s.h) * bucket) / bucket;
    g.drawImage(s.img, x0, y0, s.w, s.h);
  }

  private evict(): void {
    const arr = [...this.sprites.entries()].sort((a, b) => a[1].last - b[1].last);
    for (const [k, s] of arr.slice(0, Math.ceil(MAX_SPRITES / 4))) {
      this.sprites.delete(k);
      const bm = s.img as { close?: () => void };
      bm.close?.();
    }
  }

  clear(): void {
    for (const s of this.sprites.values()) (s.img as { close?: () => void }).close?.();
    for (const s of this.masters.values()) (s.img as { close?: () => void }).close?.();
    this.sprites.clear();
    this.masters.clear();
  }
}

/** Канвас размером wWorld×hWorld мировых единиц при разрешении bucket. */
function bake(
  bucket: number,
  wWorld: number,
  hWorld: number,
  paint: (g: CanvasRenderingContext2D, w: number, h: number) => void,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(wWorld * bucket));
  cv.height = Math.max(1, Math.ceil(hWorld * bucket));
  const g = cv.getContext("2d");
  if (!g) return null;
  g.setTransform(bucket, 0, 0, bucket, 0, 0);
  paint(g, wWorld, hWorld);
  return cv;
}

/** Канвас → ImageBitmap (неизменяемый: рисуется быстрее); нет API — остаёмся на канвасе. */
function toBitmap(cv: HTMLCanvasElement, done: (bm: ImageBitmap) => void): void {
  if (typeof createImageBitmap !== "function") return;
  createImageBitmap(cv)
    .then(done)
    .catch(() => {
      /* остаёмся на канвасе */
    });
}

/** Разрешение кадра: зум × dpr. Выше 2 спрайты не пекутся (см. drawObject). */
export function spriteBucket(scale: number, dpr: number): number {
  return scale * dpr;
}
