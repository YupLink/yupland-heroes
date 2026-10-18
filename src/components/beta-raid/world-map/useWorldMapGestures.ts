// Жесты карты мира: палец или мышь тянут карту, два пальца и колесо зумят
// вокруг себя, короткое касание без сдвига — выбор точки.
//
// Обработчики вешаем сами, а не через React: колесу и тачу нужен
// preventDefault, а React слушает их пассивно. Сдвиг считаем от СЫРЫХ
// координат начала жеста, а не от камеры (yuplink-perf §1) — иначе тап во
// время движения съедался бы как перетаскивание.
import { useEffect, useRef, type RefObject } from "react";
import type { WorldMapCtl } from "./useWorldMapView";

/** Дальше этого палец уже тянет карту, а не тапает. */
const SLOP = 6;
/** Дольше этого касание — не тап (придержал и отпустил). */
const TAP_MS = 500;

type Drag = { x: number; y: number; ox: number; oy: number; t: number; moved: boolean };
type Pinch = { d: number; s: number; wx: number; wy: number };

export function useWorldMapGestures(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  ctl: WorldMapCtl,
  onTap: (sx: number, sy: number) => void,
): void {
  const live = useRef({ ctl, onTap });
  live.current = { ctl, onTap };

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    let drag: Drag | null = null;
    let pinch: Pinch | null = null;

    const local = (cx: number, cy: number) => {
      const r = cv.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    };
    const start = (x: number, y: number, moved = false) => {
      const c = live.current.ctl.getCam();
      drag = { x, y, ox: c.ox, oy: c.oy, t: performance.now(), moved };
    };
    const move = (x: number, y: number) => {
      if (!drag) return;
      const dx = x - drag.x;
      const dy = y - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < SLOP) return;
      drag.moved = true;
      const c = live.current.ctl.getCam();
      live.current.ctl.setCam({ s: c.s, ox: drag.ox + dx, oy: drag.oy + dy });
    };
    const end = (x: number, y: number) => {
      const d = drag;
      drag = null;
      if (d && !d.moved && performance.now() - d.t < TAP_MS) live.current.onTap(x, y);
    };

    // ── Мышь и перо ──
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      const p = local(e.clientX, e.clientY);
      start(p.x, p.y);
      cv.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const p = local(e.clientX, e.clientY);
      move(p.x, p.y);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const p = local(e.clientX, e.clientY);
      end(p.x, p.y);
    };
    const onPointerCancel = () => {
      drag = null;
    };

    // ── Тач: один палец тянет, два — зумят вокруг середины и тянут ею ──
    const mid = (t: TouchList) =>
      local((t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2);
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length >= 2) {
        const c = live.current.ctl.getCam();
        const m = mid(e.touches);
        pinch = { d: dist(e.touches), s: c.s, wx: (m.x - c.ox) / c.s, wy: (m.y - c.oy) / c.s };
        drag = null;
        return;
      }
      const p = local(e.touches[0].clientX, e.touches[0].clientY);
      start(p.x, p.y);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (pinch && e.touches.length >= 2) {
        const m = mid(e.touches);
        const s = live.current.ctl.limit(pinch.s * (dist(e.touches) / Math.max(1, pinch.d)));
        live.current.ctl.setCam({ s, ox: m.x - pinch.wx * s, oy: m.y - pinch.wy * s });
        return;
      }
      if (e.touches.length === 1) {
        const p = local(e.touches[0].clientX, e.touches[0].clientY);
        move(p.x, p.y);
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        pinch = null;
        const t = e.changedTouches[0];
        if (t) {
          const p = local(t.clientX, t.clientY);
          end(p.x, p.y);
        } else drag = null;
        return;
      }
      // Из двух пальцев убрали один — тянем оставшимся, но это уже не тап.
      if (e.touches.length === 1) {
        pinch = null;
        const p = local(e.touches[0].clientX, e.touches[0].clientY);
        start(p.x, p.y, true);
      }
    };

    // ── Колесо: зум к курсору. Щипок трекпада приходит колесом с ctrlKey ──
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e.clientX, e.clientY);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const k = e.ctrlKey ? 0.01 : 0.0015;
      const c = live.current.ctl.getCam();
      live.current.ctl.zoomTo(c.s * Math.exp(-e.deltaY * unit * k), p.x, p.y);
    };

    const opts = { passive: false } as const;
    cv.addEventListener("pointerdown", onPointerDown);
    cv.addEventListener("pointermove", onPointerMove);
    cv.addEventListener("pointerup", onPointerUp);
    cv.addEventListener("pointercancel", onPointerCancel);
    cv.addEventListener("touchstart", onTouchStart, opts);
    cv.addEventListener("touchmove", onTouchMove, opts);
    cv.addEventListener("touchend", onTouchEnd);
    cv.addEventListener("touchcancel", onTouchEnd);
    cv.addEventListener("wheel", onWheel, opts);
    return () => {
      cv.removeEventListener("pointerdown", onPointerDown);
      cv.removeEventListener("pointermove", onPointerMove);
      cv.removeEventListener("pointerup", onPointerUp);
      cv.removeEventListener("pointercancel", onPointerCancel);
      cv.removeEventListener("touchstart", onTouchStart);
      cv.removeEventListener("touchmove", onTouchMove);
      cv.removeEventListener("touchend", onTouchEnd);
      cv.removeEventListener("touchcancel", onTouchEnd);
      cv.removeEventListener("wheel", onWheel);
    };
  }, [canvasRef]);
}
