// Размер холста и колесо мыши карты. Вынесено из BetaRaidCanvas (лимит строк),
// поведение то же.
//
// Размер: канвас читает его прямо в кадре, нам нужен лишь сигнал. Debounce
// 100мс: при drag-resize observer стреляет на каждый пиксель сдвига; reclamp +
// redraw на каждый — трата CPU. Fullscreen-toggle одиночный, debounce его не
// задержит (одно событие = один таймер).
// Колесо вешаем сами: React слушает wheel пассивно, preventDefault не работает.
import { useEffect } from "react";

export function useCanvasResizeWheel(o: {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  reclamp: () => void;
  requestRedraw: () => void;
  zoomBy: (k: number) => void;
}): void {
  const { wrapRef, canvasRef, reclamp, requestRedraw, zoomBy } = o;
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        reclamp();
        requestRedraw();
        resizeTimer = null;
      }, 100);
    });
    ro.observe(wrap);
    requestRedraw();
    return () => {
      ro.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [wrapRef, requestRedraw, reclamp]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY > 0 ? 0.9 : 1.1);
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, [canvasRef, zoomBy]);
}
