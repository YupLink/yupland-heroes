// Рисунок жилы в гексе: картинка вида, повёрнутая на свой угол и обрезанная
// по гексу. Ложится сразу после тайла местности и до дороги, декора и всего
// остального (chunkBake, drawGround) — так же, как сама местность, прячется
// под неразведанным туманом.
//
// Обрезка и поворот — один раз на вид × угол (2 × 6 спрайтов размером с тайл
// местности, hexTileCache), кадр и выпечка куска кладут готовый спрайт одним
// drawImage: без clip, save/restore и rotate на клетку (ПРАВИЛА §9.1).
//
// Поворот кратен 60°: гекс при нём совпадает сам с собой, меняется только
// рисунок жилы. Квадрат картинки — 2R, его вписанный круг накрывает гекс при
// любом угле, углов без рисунка не остаётся.
import { R, hexPath2D } from "./hexGeometry";
import { TILE_DRAW_H, TILE_DRAW_W, TILE_SCALE } from "./hexTileCache";
import { veinArtKey } from "@/lib/gameArt";
import type { Vein } from "./veinStore";

const SPRITE_W = Math.ceil(TILE_DRAW_W * TILE_SCALE);
const SPRITE_H = Math.ceil(TILE_DRAW_H * TILE_SCALE);

const sprites = new Map<string, HTMLCanvasElement>();

const ready = (img: HTMLImageElement | undefined): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0;

/** Готовый спрайт жилы; null — картинка ещё не приехала (или нет DOM). */
function spriteOf(vein: Vein, img: HTMLImageElement | undefined): HTMLCanvasElement | null {
  const key = `${vein.kind}:${vein.rot}`;
  const hit = sprites.get(key);
  if (hit) return hit;
  if (!ready(img) || typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = SPRITE_W;
  cv.height = SPRITE_H;
  const g = cv.getContext("2d");
  if (!g) return null;
  // 256 px картинки в ~110 px спрайта: сглаживание повыше, раз печём однажды.
  g.imageSmoothingQuality = "high";
  g.setTransform(TILE_SCALE, 0, 0, TILE_SCALE, 0, 0);
  g.translate(TILE_DRAW_W / 2, TILE_DRAW_H / 2);
  g.clip(hexPath2D());
  g.rotate((vein.rot * Math.PI) / 180);
  g.drawImage(img, -R, -R, R * 2, R * 2);
  sprites.set(key, cv);
  return cv;
}

/**
 * Положить жилу клетки: начало координат `g` — в центре гекса (как у тайла).
 * Вернёт ключ картинки, если её ещё нет, — кусок запомнит и перепечётся.
 * Картинка есть, а спрайт не испёкся (нет памяти графики) — не «ждём»: иначе
 * кусок перепекался бы каждый кадр (chunkLayer.stale).
 */
export function drawVein(
  g: CanvasRenderingContext2D,
  images: Map<string, HTMLImageElement>,
  vein: Vein,
): string | null {
  const key = veinArtKey(vein.kind);
  const img = images.get(key);
  const sprite = spriteOf(vein, img);
  if (!sprite) return ready(img) ? null : key;
  g.drawImage(sprite, -TILE_DRAW_W / 2, -TILE_DRAW_H / 2, TILE_DRAW_W, TILE_DRAW_H);
  return null;
}

/** Для тестов: забыть испечённые спрайты. */
export function resetVeinSprites(): void {
  sprites.clear();
}
