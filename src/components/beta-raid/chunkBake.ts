// Выпечка одного куска: все клетки, чей рисунок задевает его прямоугольник
// (chunkRect), сверху вниз — местность → жила → дорога → декор, неразведанные —
// чёрным; лишнее срезает clip по прямоугольнику. Вынесено из chunkLayer.ts
// (§13.1).
//
// Почему «задевает», а не «центр внутри»: дерево стоит на гексе и торчит
// вверх на 1–2 ряда, в клетки соседнего куска. Пока кусок печёл только свои
// центры, а вынос хранил в запасах по краям, канвасы соседей перекрывались, и
// кусок, положенный на холст ПОЗЖЕ (правый, нижний), накрывал тайлами верхних
// рядов верхушку дерева из запаса соседа — «ёлку отгрызало» по прямой. Теперь
// каждый кусок самодостаточен, куски за швом не пересекаются, и порядок
// укладки безразличен. Не испечённый кусок кадр рисует этой же функцией прямо
// в холст (drawStatic) — кадр с недопечёнными кусками совпадает с готовым.
import { forEachVisible, type WorldView } from "./mapIndex";
import { R, hexPath2D } from "./hexGeometry";
import { TILE_DRAW_H, TILE_DRAW_W } from "./hexTileCache";
import { RIBBON_DRAW_H, RIBBON_DRAW_W } from "./roadRibbonCache";
import { COLOR } from "./betaCanvasScene";
import { drawDecoration, decorationSprite } from "./drawDecoration";
import { blocksOf } from "./mergeBlocks";
import { REACH } from "./chunkIndex";
import type { BakeInput } from "./chunkLayer";
import { veinKey, veinsOf } from "./veinStore";
import { drawVein } from "./veinDraw";

export const imgReady = (img: HTMLImageElement | undefined): boolean =>
  !!img && img.complete && img.naturalWidth > 0;

/** Клетки, чей рисунок задевает rect: местность → жила → дорога → декор, или чёрный туман. */
export function bakeCells(
  g: CanvasRenderingContext2D,
  rect: WorldView,
  input: BakeInput,
): string[] {
  const { tiles, ribbons, images, seen, revealAll } = input;
  const scene = { g, images };
  const hex = hexPath2D();
  const missing: string[] = [];
  const blocks = blocksOf(input.index.store);
  const veins = veinsOf(input.index.store.packed);
  g.save();
  g.beginPath();
  g.rect(rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY);
  g.clip();
  // Окно обхода шире прямоугольника на вынос рисунка: сверху и с боков — на
  // полтайла, снизу — на высоту дерева, чья верхушка достаёт до куска.
  const view = {
    minX: rect.minX - REACH.x,
    maxX: rect.maxX + REACH.x,
    minY: rect.minY - REACH.y,
    maxY: rect.maxY + REACH.dec,
  };
  forEachVisible(input.index, view, (c) => {
    // Тайл, лента и чёрный туман — только если их бокс задевает кусок: ряды
    // ниже квадрата попадают в окно ради деревьев, их местность не нужна.
    if (c.y - REACH.y < rect.maxY) {
      g.translate(c.x, c.y);
      if (!revealAll && !seen.hasIndex(c.i)) {
        g.fillStyle = COLOR.fogTile;
        g.fill(hex);
        g.translate(-c.x, -c.y);
        return;
      }
      if (c.cell.terrainId) {
        const img = images.get(c.tileKey);
        const tile = tiles.get(c.tileKey, img, c.q, c.r);
        if (tile) g.drawImage(tile, -TILE_DRAW_W / 2, -TILE_DRAW_H / 2, TILE_DRAW_W, TILE_DRAW_H);
        else {
          if (!imgReady(img)) missing.push(c.tileKey);
          g.fillStyle = COLOR.grass;
          g.fill(hex);
        }
        // Жила — сразу поверх местности, под дорогой и декором (veinDraw).
        const vein = veins.size ? veins.get(veinKey(c.q, c.r)) : undefined;
        const wait = vein ? drawVein(g, images, vein) : null;
        if (wait) missing.push(wait);
      } else {
        g.fillStyle = COLOR.emptyTile;
        g.fill(hex);
      }
      const roadId = c.cell.roadId;
      if (roadId) {
        const img = images.get("r:" + roadId);
        const ribbon = ribbons.get(roadId, c.roadMask, img);
        if (ribbon) {
          g.drawImage(ribbon, -RIBBON_DRAW_W / 2, -RIBBON_DRAW_H / 2, RIBBON_DRAW_W, RIBBON_DRAW_H);
        } else if (img && !imgReady(img)) missing.push("r:" + roadId);
      }
      g.translate(-c.x, -c.y);
    } else if (!revealAll && !seen.hasIndex(c.i)) return;
    const dec = c.cell.decorationId;
    if (!dec || c.y + R * 0.55 <= rect.minY) return;
    // Декор клетки объединённого блока печём не здесь: его рисует кадр одной
    // картинкой на весь блок (drawMergedBlocks), иначе он лежал бы дважды.
    if ((blocks.groupOf[c.i] ?? -1) >= 0) return;
    const { image: img, height } = decorationSprite(images, dec);
    // Не загрузилась — помечаем и для дерева ниже квадрата: подъедет — кусок
    // перепечётся уже с его верхушкой.
    const ready = imgReady(img);
    if (!ready) missing.push("d:" + dec);
    // Верх картинки (drawDecoration: ширина 1,5R, якорь на p.y + 0,55R) или
    // зелёной точки: не достаёт до куска — не тратим drawImage за краем.
    const top =
      ready && img
        ? c.y + R * 0.55 - height
        : c.y - R * 0.25;
    if (top < rect.maxY) drawDecoration(scene, c, dec);
  });
  g.restore();
  return missing;
}

