// Кисть земли (владелец, 26.10.2026: «кисть тоже давай сделаем»): земля в руке, палец
// задержали на клетке круга — дальше он красит: каждая годная клетка под пальцем
// отмечается (пустота и своя земля под перестройку; у жилы, 29.10, — каждая клетка,
// что держит жилу). Отпустил — с «тап = разместить»
// всё ложится сразу, иначе ждёт кнопку «Разместить ×N». Без задержки палец тянет карту,
// два пальца — щипок, как всегда: режим включать не нужно.
//
// Встаёт поверх жестов стройки шахты (useMapToolGestures) — камеру не трогает,
// пока кисть не взяла палец. Щелчок, что браузер пришлёт после кисти, гасится (muteTap).
import { useRef } from "react";
import type React from "react";
import { cellAtPoint } from "../canvasHitTest";
import { R } from "../hexGeometry";
import { useMineBuildGestures } from "../mine-build/useMineBuildGestures";
import { addMark, getHand, getQuick, handAt, muteTap, runHand } from "./handStore";

type Handlers = ReturnType<typeof useMineBuildGestures>;
type Geo = Parameters<typeof useMineBuildGestures>[1];
type Pt = { x: number; y: number };

/** Сколько держать палец, чтобы кисть взяла его, и сколько можно при этом дрогнуть. */
export const BRUSH_HOLD_MS = 350;
const BRUSH_SLOP_PX = 8;

export function useHandBrush(cam: Handlers, o: Geo): Handlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<Pt | null>(null);
  const last = useRef<Pt | null>(null);
  const on = useRef(false);

  const cellOf = (p: Pt) => {
    const rect = o.canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return cellAtPoint({
      clientX: p.x,
      clientY: p.y,
      rect,
      offset: o.offsetRef.current,
      scale: o.scaleRef.current,
      centerQ: o.grid.centerQ,
      c0q: o.grid.c0q,
    });
  };
  const paint = (p: Pt) => {
    const c = cellOf(p);
    if (c && handAt(c.q, c.r)?.ok) addMark(c);
  };
  /** Быстрый мазок: между двумя точками пальца — через треть клетки, без пропусков. */
  const stroke = (to: Pt) => {
    const from = last.current ?? to;
    const step = Math.max(4, (R * (o.scaleRef.current ?? 1)) / 3);
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
    for (let i = 1; i <= n; i++)
      paint({ x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n });
    last.current = to;
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  /** Палец лёг: кисть возьмёт его, если земля или жила в руке, клетка в круге и он постоит. */
  const arm = (p: Pt) => {
    cancel();
    start.current = p;
    const kind = getHand()?.kind;
    const c = kind === "land" || kind === "vein" ? cellOf(p) : null;
    if (!c || !handAt(c.q, c.r)?.ok) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      on.current = true;
      last.current = null;
      stroke(p);
    }, BRUSH_HOLD_MS);
  };
  /** Палец ушёл до срока дальше допуска — это ход карты, кисти не будет. */
  const moved = (p: Pt) => {
    const s = start.current;
    if (timer.current && s && Math.hypot(p.x - s.x, p.y - s.y) > BRUSH_SLOP_PX) cancel();
  };
  const finish = () => {
    cancel();
    if (!on.current) return false;
    on.current = false;
    muteTap(400);
    const marks = getHand()?.marks ?? [];
    if (getQuick() && marks.length) runHand(marks);
    return true;
  };

  return {
    onPointerDown: (e) => {
      if (e.pointerType !== "touch") arm({ x: e.clientX, y: e.clientY });
      cam.onPointerDown(e);
    },
    onPointerMove: (e) => {
      if (e.pointerType === "touch") return cam.onPointerMove(e);
      if (on.current) return stroke({ x: e.clientX, y: e.clientY });
      moved({ x: e.clientX, y: e.clientY });
      cam.onPointerMove(e);
    },
    onPointerUp: (e) => {
      if (e.pointerType !== "touch") finish();
      cam.onPointerUp(e);
    },
    onTouchStart: (e) => {
      if (e.touches.length === 1) arm({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      else finish();
      cam.onTouchStart(e);
    },
    onTouchMove: (e) => {
      const t = e.touches[0];
      if (on.current && e.touches.length === 1 && t) return stroke({ x: t.clientX, y: t.clientY });
      if (t) moved({ x: t.clientX, y: t.clientY });
      cam.onTouchMove(e);
    },
    onTouchEnd: (e) => {
      if (e.touches.length === 0) finish();
      cam.onTouchEnd(e);
    },
  };
}

/** Жесты карты: стройка шахты водит заготовку, земля в руке — кисть, иначе — камера. */
export function useMapToolGestures(cam: Handlers, o: Geo): Handlers {
  return useHandBrush(useMineBuildGestures(cam, o), o);
}
