import { R } from "../hexGeometry";
import { treePlacement } from "./treePlacement";
type Scene = { g: CanvasRenderingContext2D; scale: number; toPixel: (q: number, r: number) => { x: number; y: number } };
/** Uses the same world transform as map cells: follows pan and zoom. */
export function drawTreePlacement({ g, scale, toPixel }: Scene): void {
  const state = treePlacement.get();
  if (!state || state.phase !== "ready") return;
  g.save();
  for (const c of state.cells) {
    const p = toPixel(c.q, c.r);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (60 * i - 30) * Math.PI / 180;
      const x = p.x + Math.cos(a) * R * .93, y = p.y + Math.sin(a) * R * .93;
      if (!i) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = c.ok ? "rgba(100,190,127,.18)" : "rgba(20,23,24,.15)";
    g.strokeStyle = c.ok ? "#b5e6a2" : "#baa08c";
    g.lineWidth = 1.5 / scale;
    g.setLineDash(c.ok ? [] : [3 / scale, 3 / scale]);
    g.fill(); g.stroke();
    // A plus is a second, non-colour cue for actionable cells.
    if (c.ok) {
      g.setLineDash([]); g.strokeStyle = "#f4ffe9"; g.lineWidth = 2 / scale;
      g.beginPath(); g.moveTo(p.x - 4 / scale, p.y); g.lineTo(p.x + 4 / scale, p.y);
      g.moveTo(p.x, p.y - 4 / scale); g.lineTo(p.x, p.y + 4 / scale); g.stroke();
    }
  }
  g.restore();
}
