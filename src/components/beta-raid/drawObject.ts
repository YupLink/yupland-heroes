// Объект на клетке (сундук, артефакт, босс) и стрелка побега беглеца.
// Вынесено из betaCanvasDraw.ts (§13.1).
import { R } from "./hexGeometry";
import type { DrawCell, DrawScene } from "./betaCanvasScene";
import type { SceneCell } from "./mapIndex";
import { RING_DEFAULT, RING_GLOW } from "./objectRing";

/**
 * Красная стрелка «беглец убежал ОТСЮДА ТУДА» — вспышка направления. Рисуется
 * МЕЖДУ клеткой, откуда он ушёл (c), и клеткой назначения: в середине отрезка,
 * остриём на «куда». Так видно направление между клетками, а не поверх объекта.
 * Красный близнец зелёной стрелки маршрута (ключ картинки "runner-arrow").
 */
export function drawRunnerArrow(scene: DrawScene, c: SceneCell): void {
  const dest = scene.runnerArrows?.[c.key];
  if (!dest) return;
  const img = scene.images.get("runner-arrow");
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const { g } = scene;
  const to = scene.toPixel(dest.toQ, dest.toR);
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  // Середина отрезка «откуда → куда»: стрелка стоит МЕЖДУ клетками.
  const midX = c.x + dx / 2;
  const midY = c.y + dy / 2;
  const angle = Math.atan2(dy, dx); // картинка смотрит вправо (восток)
  const gap = Math.hypot(dx, dy);
  // Длиной примерно по зазору (беглец уходит на 1-2 клетки), но с потолком.
  const w = Math.max(R * 0.8, Math.min(gap * 0.85, R * 1.7));
  const h = w * (img.naturalHeight / img.naturalWidth);
  g.save();
  g.translate(midX, midY);
  g.rotate(angle);
  g.globalAlpha = 0.95;
  g.drawImage(img, -w / 2, -h / 2, w, h);
  g.restore();
}

export function drawObject(
  scene: DrawScene,
  p: { x: number; y: number },
  cell: DrawCell,
  inDarkFog = false,
): void {
  // Поверженный объект — не рисуем в активной зоне, но показываем в тёмном тумане
  // (исторический обзор: объект был, когда игрок видел клетку последний раз).
  if (cell.objectDefeated && !inDarkFog) return;
  const { g, images } = scene;
  // Поверженный в тёмном тумане — приглушённый вид.
  const isHistorical = cell.objectDefeated && inDarkFog;
  const img = images.get("o:" + cell.objectId);
  const ring = scene.objectRings.get(cell.objectId ?? "") ?? RING_DEFAULT;

  if (img && img.complete && img.naturalWidth > 0) {
    const glow = RING_GLOW.has(ring);
    // Иконка на любом зуме — та же картинка. При отдалении — спрайт,
    // испечённый под текущий размер (spriteCache), одним drawImage 1:1: при
    // сильном приближении объектов в кадре единицы, рисуем напрямую из
    // полной картинки, чтобы не терять чёткость.
    if (scene.sprites && scene.bucket <= SPRITE_MAX_BUCKET) {
      const size = TOKEN_D + (glow ? R * 0.48 : 6);
      const sprite = scene.sprites.get(
        `o:${cell.objectId}|${ring}`,
        scene.bucket,
        size,
        size,
        (sg, w, h) => paintToken(sg, img, ring, glow, w / 2, h / 2),
      );
      if (sprite) {
        if (isHistorical) g.globalAlpha = 0.4;
        scene.sprites.draw(g, sprite, p.x, p.y, scene.bucket);
        if (isHistorical) g.globalAlpha = 1;
        return;
      }
    }
    g.save();
    if (isHistorical) g.globalAlpha = 0.4;
    paintToken(g, img, ring, glow, p.x, p.y);
    g.restore();
    return;
  }

  // Картинка ещё не доехала — тёмный жетон с кольцом, без спрайта.
  g.save();
  if (isHistorical) g.globalAlpha = 0.4;
  {
    g.beginPath();
    g.arc(p.x, p.y, R * 0.6, 0, Math.PI * 2);
    g.fillStyle = "#26283a";
    g.fill();
  }
  // Ободок: редкость артефакта, уровень босса.
  // Свечение — вместо shadowBlur (GPU-убийца) рисуем второй полупрозрачный круг.
  if (RING_GLOW.has(ring)) {
    g.beginPath();
    g.arc(p.x, p.y, R * 0.72, 0, Math.PI * 2);
    g.strokeStyle = ring;
    g.globalAlpha = 0.35;
    g.lineWidth = R * 0.24;
    g.stroke();
    g.globalAlpha = 1;
  }
  g.beginPath();
  g.arc(p.x, p.y, R * 0.6, 0, Math.PI * 2);
  g.strokeStyle = ring;
  g.lineWidth = RING_GLOW.has(ring) ? 3 : 2;
  g.stroke();
  g.restore();
}

/** Диаметр жетона объекта в мировых единицах. */
const TOKEN_D = R * 1.2;
/** Выше этого разрешения спрайты не печём — картинка рисуется напрямую. */
export const SPRITE_MAX_BUCKET = 2;

/** Жетон: картинка в круге + кольцо редкости (+ мягкое кольцо у редких). */
function paintToken(
  g: CanvasRenderingContext2D,
  img: HTMLImageElement,
  ring: string,
  glow: boolean,
  cx: number,
  cy: number,
): void {
  const rad = TOKEN_D / 2;
  g.save();
  g.beginPath();
  g.arc(cx, cy, rad, 0, Math.PI * 2);
  g.clip();
  g.drawImage(img, cx - rad, cy - rad, rad * 2, rad * 2);
  g.restore();
  // Ободок: редкость артефакта, уровень босса. Свечение — второй
  // полупрозрачный круг, не shadowBlur.
  if (glow) {
    g.beginPath();
    g.arc(cx, cy, R * 0.72, 0, Math.PI * 2);
    g.strokeStyle = ring;
    g.globalAlpha = 0.35;
    g.lineWidth = R * 0.24;
    g.stroke();
    g.globalAlpha = 1;
  }
  g.beginPath();
  g.arc(cx, cy, rad, 0, Math.PI * 2);
  g.strokeStyle = ring;
  g.lineWidth = glow ? 3 : 2;
  g.stroke();
}
