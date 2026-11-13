// Значки точек спавна (режим бога): лиловое кольцо на клетке точки. Только
// админу и только в режиме бога — список приходит из spawnMarks.
import type { DrawScene } from "@/components/beta-raid/betaCanvasScene";
import type { MapStore } from "@/components/beta-raid/mapStore";
import { R } from "@/components/beta-raid/hexGeometry";
import { getSpawnMarks } from "./spawnMarks";

const RING = "#c084fc";
const CORE = "rgba(192,132,252,0.35)";

export function drawSpawnPoints(scene: DrawScene, store: MapStore, mapId: string | null): void {
  const { marks, mapId: of } = getSpawnMarks();
  if (!marks?.length || of !== mapId) return;
  const g = scene.g;
  const v = scene.view;
  g.save();
  g.lineWidth = Math.max(2, 3 / Math.max(scene.scale, 0.25));
  for (const m of marks) {
    const i = store.indexOfKey(`${m.q},${m.r}`);
    if (i < 0) continue;
    const x = store.geom.x[i];
    const y = store.geom.y[i];
    if (x < v.minX - R || x > v.maxX + R || y < v.minY - R || y > v.maxY + R) continue;
    g.beginPath();
    g.arc(x, y, R * 0.62, 0, Math.PI * 2);
    g.fillStyle = CORE;
    g.fill();
    g.strokeStyle = RING;
    g.stroke();
  }
  g.restore();
}
