// Холст карты мира: картинка местности, метки и жесты; тап — выбор клетки.
import { useRef } from "react";
import { useWorldMapView } from "./useWorldMapView";
import { useWorldMapGestures } from "./useWorldMapGestures";
import type { WorldMapModel } from "./worldMapModel";
import type { TerrainPalette } from "./useTerrainPalette";
import type { WorldLayer } from "./worldMapLayers";

export function WorldMapCanvas({
  model,
  palette,
  heroQ,
  heroR,
  castle,
  hidden,
  onPick,
}: {
  model: WorldMapModel | null;
  palette: TerrainPalette | null;
  /** Где герой — числами: объект ломал бы мемо сцены на каждом рендере. */
  heroQ: number | null;
  heroR: number | null;
  castle: { q: number; r: number };
  /** Выключенные в легенде виды меток. */
  hidden: ReadonlySet<WorldLayer>;
  /** Тап по клетке с местностью или рядом с меткой — её координаты. */
  onPick: (q: number, r: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctl = useWorldMapView({
    wrapRef,
    canvasRef,
    model,
    palette,
    heroQ,
    heroR,
    castleQ: castle.q,
    castleR: castle.r,
    hidden,
  });
  useWorldMapGestures(canvasRef, ctl, (x, y) => {
    const cell = ctl.pick(x, y);
    if (cell) onPick(cell.q, cell.r);
  });
  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
      />
    </div>
  );
}
