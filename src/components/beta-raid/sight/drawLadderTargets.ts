// Подсветка клеток, куда можно перелезть лестницей (§8.121) — как у посадки
// дерева (drawTreePlacement): тот же мировой масштаб, ход за паном и зумом.
import { R } from "../hexGeometry";
import { ladderTargetsNow } from "./ladderMode";

type Scene = {
  g: CanvasRenderingContext2D;
  scale: number;
  toPixel: (q: number, r: number) => { x: number; y: number };
};

export function drawLadderTargets({ g, scale, toPixel }: Scene): void {
  const cells = ladderTargetsNow();
  if (cells.length === 0) return;
  g.save();
  for (const c of cells) {
    const p = toPixel(c.q, c.r);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = ((60 * i - 30) * Math.PI) / 180;
      const x = p.x + Math.cos(a) * R * 0.93;
      const y = p.y + Math.sin(a) * R * 0.93;
      if (!i) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = "rgba(125,211,252,.18)";
    g.strokeStyle = "#7dd3fc";
    g.lineWidth = 2 / scale;
    g.fill();
    g.stroke();
  }
  g.restore();
}
