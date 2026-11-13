// Подложка клетки (местность + жила + дорога) и проверка границы разведанного.
// Вынесено из betaCanvasDraw.ts (правило ≤250 строк).
import { ROAD_DIRS } from "./hexGeometry";
import type { MapStore } from "./mapStore";
import { TILE_DRAW_H, TILE_DRAW_W } from "./hexTileCache";
import { RIBBON_DRAW_H, RIBBON_DRAW_W } from "./roadRibbonCache";
import type { SceneCell } from "./mapIndex";
import { COLOR, type DrawScene } from "./betaCanvasScene";
import { veinKey, veinsOf } from "./veinStore";
import { drawVein } from "./veinDraw";

/** Местность, жила и дорога одной клетки — тот же порядок, что при выпечке куска. */
export function drawGround(scene: DrawScene, c: SceneCell, hex: Path2D, store: MapStore): void {
  const { g } = scene;
  g.translate(c.x, c.y);
  if (c.cell.terrainId) {
    const tile = scene.tiles.get(c.tileKey, scene.images.get(c.tileKey), c.q, c.r);
    if (tile) g.drawImage(tile, -TILE_DRAW_W / 2, -TILE_DRAW_H / 2, TILE_DRAW_W, TILE_DRAW_H);
    else {
      g.fillStyle = COLOR.grass;
      g.fill(hex);
    }
    const veins = veinsOf(store.packed);
    const vein = veins.size ? veins.get(veinKey(c.q, c.r)) : undefined;
    if (vein) drawVein(g, scene.images, vein);
  } else {
    g.fillStyle = COLOR.emptyTile;
    g.fill(hex);
  }
  // Дорога — ЛЕНТА, сшитая с соседями. Спрайт испечён заранее
  // (roadRibbonCache), тут — один drawImage.
  const roadId = c.cell.roadId;
  if (roadId) {
    const ribbon = scene.ribbons.get(roadId, c.roadMask, scene.images.get("r:" + roadId));
    if (ribbon) {
      g.drawImage(ribbon, -RIBBON_DRAW_W / 2, -RIBBON_DRAW_H / 2, RIBBON_DRAW_W, RIBBON_DRAW_H);
    }
  }
  g.translate(-c.x, -c.y);
}

/** Есть ли у клетки разведанный сосед (границы неразведанного). */
export function touchesSeen(
  store: MapStore,
  seen: { hasIndex(i: number): boolean },
  q: number,
  r: number,
): boolean {
  for (const d of ROAD_DIRS) {
    const j = store.index(q + d.q, r + d.r);
    if (j >= 0 && seen.hasIndex(j)) return true;
  }
  return false;
}

