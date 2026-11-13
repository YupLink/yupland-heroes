// Подложка ряби и верхний холст карты (waterLayers.ts): пока стоим у воды, рябь
// идёт сама, а кадр карты не перерисовывается 8 раз в секунду. Ставить сразу
// после основного <canvas>: абсолютные слои ложатся поверх него и под HUD.
import { memo, useEffect, useRef } from "react";

type Bind = (water: HTMLCanvasElement | null, top: HTMLCanvasElement | null) => void;

export const MapWaterLayers = memo(function MapWaterLayers({ bind }: { bind: Bind }) {
  const water = useRef<HTMLCanvasElement | null>(null);
  const top = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    bind(water.current, top.current);
    return () => bind(null, null);
  }, [bind]);
  return (
    <>
      <canvas ref={water} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 [image-rendering:pixelated]" />
      <canvas ref={top} aria-hidden className="pointer-events-none invisible absolute inset-0 h-full w-full" />
    </>
  );
});
