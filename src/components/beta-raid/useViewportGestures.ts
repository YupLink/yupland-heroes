// Жесты камеры карты: один палец (мышь) тянет, два — зумят.
//
// Вынесено из useCanvasViewport без изменения поведения (файл перерос 250
// строк). Тела обработчиков — те же, что были: жесты не зависят от кадра, база
// жеста берётся из offsetRef, а не из того, что успел отрисовать React —
// во время глайда камеры тап иначе «съедался» бы как перетаскивание.
import { useRef } from "react";
import type React from "react";
import { focalPinch, offsetForAnchor, worldUnder } from "./pinchMode";

export function useViewportGestures(cam: {
  /** Текущее (анимируемое) смещение камеры — база жеста. */
  offsetRef: React.RefObject<{ x: number; y: number }>;
  /** Текущий (анимируемый) зум — база щипка «под пальцами». */
  scaleRef: React.RefObject<number>;
  /** Целевой зум — от него считается пинч. */
  targetScale: React.RefObject<number>;
  moveTo: (next: { x: number; y: number }, instant?: boolean) => void;
  zoomTo: (s: number) => void;
  /** Поставить сдвиг и зум сразу (щипок «под пальцами»). */
  setCamera: (next: { x: number; y: number }, s: number) => void;
  clampScale: (s: number) => number;
  /** Пользователь взял камеру в руки — следование за героем выключаем. */
  stopFollow: () => void;
}) {
  const { offsetRef, scaleRef, targetScale, moveTo, zoomTo, setCamera, clampScale, stopFollow } =
    cam;
  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const pinch = useRef<{
    dist: number;
    scale: number;
    /** Щипок «под пальцами»: точка карты под серединой пальцев и рамка холста. */
    world?: { x: number; y: number };
    box?: { left: number; top: number; W: number; H: number };
  } | null>(null);

  // Начало жеста: где палец и где была камера.
  const gesture = useRef({ pointerX: 0, pointerY: 0, camX: 0, camY: 0 });

  const startDrag = (x: number, y: number) => {
    dragging.current = true;
    dragMoved.current = false;
    gesture.current = {
      pointerX: x,
      pointerY: y,
      camX: offsetRef.current.x,
      camY: offsetRef.current.y,
    };
  };

  /** Сдвиг пальца от начала жеста — не зависит от того, что успел отрисовать React. */
  const dragTo = (x: number, y: number, slop: number) => {
    const dx = x - gesture.current.pointerX;
    const dy = y - gesture.current.pointerY;
    if (Math.abs(dx) > slop || Math.abs(dy) > slop) dragMoved.current = true;
    // Драг — пользователь управляет камерой, follow останавливаем.
    stopFollow();
    moveTo({ x: gesture.current.camX + dx, y: gesture.current.camY + dy }, true);
  };

  // ── Мышь / перо ──
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return; // тач ведём сами, ниже
    startDrag(e.clientX, e.clientY);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || e.pointerType === "touch") return;
    dragTo(e.clientX, e.clientY, 3);
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  // ── Тач: один палец тянет карту, два — зумят ──
  const dist = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const mid = (t: React.TouchList, box: { left: number; top: number }) => ({
    x: (t[0].clientX + t[1].clientX) / 2 - box.left,
    y: (t[0].clientY + t[1].clientY) / 2 - box.top,
  });

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length >= 2 && focalPinch()) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const box = { left: r.left, top: r.top, W: r.width, H: r.height };
      const s0 = scaleRef.current;
      pinch.current = {
        dist: dist(e.touches),
        scale: s0,
        world: worldUnder(mid(e.touches, box), offsetRef.current, s0, box.W, box.H),
        box,
      };
      dragging.current = false;
      stopFollow();
      return;
    }
    if (e.touches.length >= 2) {
      pinch.current = { dist: dist(e.touches), scale: targetScale.current };
      dragging.current = false;
      stopFollow();
      return;
    }
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const p = pinch.current;
    if (p?.world && p.box && e.touches.length >= 2) {
      // Масштаб — от расстояния между пальцами, сдвиг — чтобы точка карты,
      // с которой начался жест, осталась под серединой пальцев.
      const d = dist(e.touches);
      const s = clampScale(p.dist > 0 ? p.scale * (d / p.dist) : p.scale);
      setCamera(offsetForAnchor(p.world, mid(e.touches, p.box), s, p.box.W, p.box.H), s);
      dragMoved.current = true;
      return;
    }
    if (pinch.current && e.touches.length >= 2) {
      const d = dist(e.touches);
      if (pinch.current.dist > 0) zoomTo(pinch.current.scale * (d / pinch.current.dist));
      dragMoved.current = true;
      return;
    }
    if (!dragging.current || e.touches.length !== 1) return;
    dragTo(e.touches[0].clientX, e.touches[0].clientY, 4);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      dragging.current = false;
      pinch.current = null;
      return;
    }
    // Убрали один палец из двух — продолжаем тянуть картой оставшимся,
    // иначе карта «залипала» после каждого пинча.
    if (e.touches.length === 1) {
      pinch.current = null;
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  return {
    dragMoved,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onTouchStart, onTouchMove, onTouchEnd },
  };
}
