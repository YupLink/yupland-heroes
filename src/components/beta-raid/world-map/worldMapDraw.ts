// Кадр карты мира: фон, местность одной картинкой, метки, замок, герой.
//
// Никаких теней, свечений и подсветок (ПРАВИЛА §9): контур метки — обычная
// тёмная обводка. Метки одного вида собираются в один путь: одна заливка и
// одна обводка на вид — сколько бы шахт и порталов ни было, вызовов на кадр
// не больше двух на вид. Выключенных в легенде видов в кадре нет вовсе
// (visibleScene).
import type { WorldMarkKind } from "@/lib/raid/worldMapCodec";
import { KX, type Cam, type Pt } from "./worldMapCamera";
import { addMarkPath } from "./worldMapMarks";
import {
  CASTLE_FILL,
  HERO_FILL,
  MARK_ORDER,
  MARK_STYLE,
  markSize,
  OUTLINE,
  WORLD_BG,
} from "./worldMapMarkStyle";

export type WorldFrame = {
  cam: Cam;
  dpr: number;
  viewW: number;
  viewH: number;
  /** Местность, испечённая в картинку (paintTerrain); null — ещё не готова. */
  image: HTMLCanvasElement | null;
  marks: ReadonlyArray<Pt & { kind: WorldMarkKind }>;
  castle: Pt | null;
  castleImg: HTMLImageElement | null;
  hero: Pt | null;
};

export function drawWorldMap(g: CanvasRenderingContext2D, f: WorldFrame): void {
  const { cam, dpr } = f;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = WORLD_BG;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  if (f.image && f.image.width > 0) {
    // Пиксель картинки шире строки в KX раз — так клетки встают гексами.
    g.setTransform(cam.s * KX * dpr, 0, 0, cam.s * dpr, cam.ox * dpr, cam.oy * dpr);
    // Издалека клетка мельче пары пикселей экрана — сглаживаем, иначе рябь при
    // движении; вблизи — чёткие клетки без мыла.
    g.imageSmoothingEnabled = cam.s * KX * dpr < 2;
    g.drawImage(f.image, 0, 0);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const size = markSize(cam.s);
  drawMarks(g, f, size);
  if (f.castle) drawCastle(g, f, f.castle, size);
  if (f.hero) drawHero(g, f.cam, f.hero, size);
}

function drawMarks(g: CanvasRenderingContext2D, f: WorldFrame, base: number): void {
  const { cam } = f;
  // Издалека метка в 6–7 px: толстая обводка съела бы цвет — она тоньше.
  g.lineWidth = base < 8 ? 1 : 1.5;
  g.strokeStyle = OUTLINE;
  for (const kind of MARK_ORDER) {
    const style = MARK_STYLE[kind];
    const size = base * (style.scale ?? 1);
    let any = false;
    g.beginPath();
    for (const m of f.marks) {
      if (m.kind !== kind) continue;
      const x = m.x * cam.s + cam.ox;
      const y = m.y * cam.s + cam.oy;
      // За краем экрана не рисуем: путь короче, кадр дешевле.
      if (x < -size || y < -size || x > f.viewW + size || y > f.viewH + size) continue;
      addMarkPath(g, style.shape, x, y, size);
      any = true;
    }
    if (!any) continue;
    g.fillStyle = style.fill;
    g.fill();
    g.stroke();
  }
}

function drawCastle(g: CanvasRenderingContext2D, f: WorldFrame, p: Pt, size: number): void {
  const x = p.x * f.cam.s + f.cam.ox;
  const y = p.y * f.cam.s + f.cam.oy;
  const img = f.castleImg;
  if (img && img.complete && img.naturalWidth > 0) {
    // Мельче 16 px пиксель-арт замка превращается в пятно — не уменьшаем.
    const w = Math.max(16, size * 2.2);
    // Пиксель-арт не сглаживаем — иначе мыло (как на кнопке замка).
    g.imageSmoothingEnabled = false;
    g.drawImage(img, x - w / 2, y - w / 2, w, w);
    return;
  }
  const h = size * 0.7;
  g.fillStyle = CASTLE_FILL;
  g.fillRect(x - h, y - h, h * 2, h * 2);
  g.lineWidth = 1.5;
  g.strokeStyle = OUTLINE;
  g.strokeRect(x - h, y - h, h * 2, h * 2);
}

function drawHero(g: CanvasRenderingContext2D, cam: Cam, p: Pt, size: number): void {
  const x = p.x * cam.s + cam.ox;
  const y = p.y * cam.s + cam.oy;
  // Герой крупнее меток и с толстой тёмной обводкой: золото читается и над
  // водой, и над снегом — без колец и свечений.
  g.beginPath();
  g.arc(x, y, size * 0.6 + 2, 0, Math.PI * 2);
  g.fillStyle = HERO_FILL;
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = OUTLINE;
  g.stroke();
}
