// Ямка от лопаты на земле (владелец, 02.10.2026; src/lib/digHole.ts): час после
// «Копать» / «Выкопать». Лежит на земле — рисуется в проходе клеток сразу за
// местностью, до всего, что стоит на клетке (герой, лагерь, объект — поверх), и
// под плёнкой тумана, как дорога.
//
// Правила кадра (ПРАВИЛА §9): без теней и свечений, спрайт печётся один раз под
// зум, без save/restore. Издалека (LOD) — тёмный овал: видно на любом зуме.
import { R } from "@/components/beta-raid/hexGeometry";
import type { DrawScene } from "@/components/beta-raid/betaCanvasScene";
import type { SceneCell } from "@/components/beta-raid/mapIndex";
import { SPRITE_MAX_BUCKET } from "@/components/beta-raid/drawObject";

/** Ниже этого зума деталей не видно (ПРАВИЛА §9.2): овал вместо картинки. */
export const HOLE_LOD_SCALE = 0.5;
export const HOLE_KEY = "dig-hole";
/** Ширина ямки — чуть уже гекса; низ ямки — немного ниже центра клетки. */
const W = R * 1.35;
const BOTTOM = R * 0.5;
const FILL = "#4a2f1b";
const PIT = "#1c120a";

export function drawDigHole(scene: DrawScene, c: SceneCell): void {
  const { g } = scene;
  const bottom = c.y + BOTTOM;
  if (scene.scale < HOLE_LOD_SCALE) {
    const rx = W * 0.42;
    const ry = rx * 0.45;
    g.beginPath();
    g.ellipse(c.x, bottom - ry, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = FILL;
    g.fill();
    g.beginPath();
    g.ellipse(c.x, bottom - ry, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2);
    g.fillStyle = PIT;
    g.fill();
    return;
  }
  const img = scene.images.get(HOLE_KEY);
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const h = W * (img.naturalHeight / img.naturalWidth);
  const sprites = scene.sprites;
  const sprite =
    sprites && scene.bucket <= SPRITE_MAX_BUCKET
      ? sprites.get(HOLE_KEY, scene.bucket, W, h, (sg, sw, sh) => sg.drawImage(img, 0, 0, sw, sh))
      : null;
  if (sprites && sprite) sprites.drawBottom(g, sprite, c.x, bottom, scene.bucket);
  else g.drawImage(img, c.x - W / 2, bottom - h, W, h);
}
