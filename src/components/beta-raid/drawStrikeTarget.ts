// Дерево (камень) под ударом героя (heroActionVisual): 3 с удара рисуем его
// исходную картинку — сервер может убрать декор раньше. Размер — как на карте:
// декор объединённого блока (лес на две клетки) — на весь блок, как его рисует
// drawBlock, а не на одну клетку: иначе большой лес на время ударов «сжимался».
// Карта показывает у блока декор первой клетки с ним (leadDecor, порядок r↑ q↑):
// раньше удара есть другая клетка с декором — рубим скрытый, картинку блока
// держит сама карта, свою не кладём (иначе на 3 с — чужой лес на весь блок).
import type { DrawScene } from "./betaCanvasScene";
import { drawDecoration } from "./drawDecoration";
import type { MapStore } from "./mapStore";
import { blockAt } from "./mergeBlocks";

export type StrikeStore = MapStore | null | undefined;

export function drawStrikeTarget(
  scene: Pick<DrawScene, "g" | "images" | "toPixel">,
  store: StrikeStore,
  t: { q: number; r: number; decorId: string },
): void {
  const i = store ? store.index(t.q, t.r) : -1;
  const b = store && i >= 0 ? blockAt(store, i) : null;
  if (!b) return drawDecoration(scene, scene.toPixel(t.q, t.r), t.decorId);
  const before = b.cells.slice(0, b.cells.indexOf(i));
  if (before.some((j) => store?.decorationId(j))) return;
  const w = (b.maxX - b.minX) * b.scale;
  drawDecoration(scene, { x: (b.minX + b.maxX) / 2, y: b.yLow }, t.decorId, w * (1.5 / 1.7));
}
