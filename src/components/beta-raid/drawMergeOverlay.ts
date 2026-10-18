// Оверлей режима «Объединить» (режим бога): выделенные клетки, готовые блоки
// и выбранный блок. Рисуется только пока админ в этом режиме — игроки и
// прочие режимы этого слоя не видят. Тот же приём, что у drawGenSelected:
// кэшированный Path2D гекса + translate, без save/restore на клетку.
import { R, hexPath2D } from "./hexGeometry";
import type { DrawScene } from "./betaCanvasScene";
import type { MapStore } from "./mapStore";
import { blocksOf } from "./mergeBlocks";

export type MergeSelection = {
  /** Клетки «q,r», набранные под объединение. */
  selected: Set<string>;
  /** id выбранного блока (масштаб/разъединение); null — не выбран. */
  active: string | null;
};

const SEL = "#a78bfa";
const BLOCK = "#7c3aed";

export function drawMergeOverlay(scene: DrawScene, store: MapStore, sel: MergeSelection): void {
  const { g, toPixel } = scene;
  const hex = hexPath2D();
  g.save();
  // Готовые блоки — пунктиром; выбранный — сплошной и с заливкой.
  const blocks = blocksOf(store);
  for (const b of blocks.list) {
    const isActive = b.gid === sel.active;
    g.strokeStyle = isActive ? SEL : BLOCK;
    g.lineWidth = isActive ? 3 : 1.5;
    g.setLineDash(isActive ? [] : [R * 0.2, R * 0.14]);
    for (const i of b.cells) {
      const x = store.geom.x[i];
      const y = store.geom.y[i];
      g.translate(x, y);
      if (isActive) {
        g.fillStyle = "rgba(167, 139, 250, 0.2)";
        g.fill(hex);
      }
      g.stroke(hex);
      g.translate(-x, -y);
    }
  }
  // Набранные клетки — сплошная обводка и лёгкая заливка.
  if (sel.selected.size > 0) {
    g.setLineDash([]);
    g.strokeStyle = SEL;
    g.lineWidth = 3;
    g.fillStyle = "rgba(167, 139, 250, 0.2)";
    for (const key of sel.selected) {
      const [q, r] = key.split(",").map(Number);
      if (!Number.isFinite(q) || !Number.isFinite(r)) continue;
      const p = toPixel(q, r);
      g.translate(p.x, p.y);
      g.fill(hex);
      g.stroke(hex);
      g.translate(-p.x, -p.y);
    }
  }
  g.restore();
}
