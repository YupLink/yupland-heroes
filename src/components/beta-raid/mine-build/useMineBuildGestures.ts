// Жесты карты в режиме стройки: заготовку водят пальцем (мышью) по кругу.
//
// Решение (телефон прежде всего): палец, поставленный ВНУТРИ круга кандидатов
// (радиус 2 вокруг героя), тянет призрак шахты — камера стоит; палец вне круга
// тянет карту как обычно; два пальца — всегда щипок и сдвиг карты. Тап по
// клетке ставит призрак туда же (тап доходит обычным путём — useMineBuild.tap).
// Вне режима обработчики камеры работают как были.
import { useRef } from "react";
import type React from "react";
import { cellAtPoint } from "../canvasHitTest";
import { MINE_BUILD_RADIUS } from "@/lib/minePlacement";
import { hexDist } from "@/lib/mineBuild";
import { getMineBuild, moveMineGhost } from "./mineBuildStore";

type Handlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
};

export function useMineBuildGestures(
  cam: Handlers,
  o: {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    offsetRef: React.RefObject<{ x: number; y: number }>;
    scaleRef: React.RefObject<number>;
    grid: { centerQ: number; c0q: number };
  },
): Handlers {
  const drag = useRef(false);

  const cellOf = (clientX: number, clientY: number) => {
    const rect = o.canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return cellAtPoint({
      clientX,
      clientY,
      rect,
      offset: o.offsetRef.current,
      scale: o.scaleRef.current,
      centerQ: o.grid.centerQ,
      c0q: o.grid.c0q,
    });
  };

  /** Палец лёг в круг — берём призрак. false — это жест камеры. */
  const grab = (x: number, y: number): boolean => {
    const center = getMineBuild()?.center;
    const c = center ? cellOf(x, y) : null;
    if (!center || !c || hexDist(center, c) > MINE_BUILD_RADIUS) return false;
    drag.current = true;
    moveMineGhost(c.q, c.r);
    return true;
  };

  const follow = (x: number, y: number) => {
    const c = cellOf(x, y);
    if (c) moveMineGhost(c.q, c.r);
  };

  return {
    onPointerDown: (e) => {
      if (e.pointerType !== "touch" && grab(e.clientX, e.clientY)) {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        return;
      }
      cam.onPointerDown(e);
    },
    onPointerMove: (e) => {
      if (drag.current && e.pointerType !== "touch") return follow(e.clientX, e.clientY);
      cam.onPointerMove(e);
    },
    onPointerUp: (e) => {
      if (drag.current && e.pointerType !== "touch") {
        drag.current = false;
        return;
      }
      cam.onPointerUp(e);
    },
    onTouchStart: (e) => {
      if (e.touches.length === 1 && grab(e.touches[0].clientX, e.touches[0].clientY)) return;
      drag.current = false;
      cam.onTouchStart(e);
    },
    onTouchMove: (e) => {
      if (drag.current && e.touches.length === 1)
        return follow(e.touches[0].clientX, e.touches[0].clientY);
      cam.onTouchMove(e);
    },
    onTouchEnd: (e) => {
      if (drag.current) {
        if (e.touches.length === 0) drag.current = false;
        return;
      }
      cam.onTouchEnd(e);
    },
  };
}
