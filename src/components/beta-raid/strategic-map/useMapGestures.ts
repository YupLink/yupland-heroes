import { useEffect, useRef, useState, useCallback, type PointerEvent } from 'react';
import { clampView, zoomAt, type MapView, type Point } from './mapViewport';

export function useMapGestures(view: MapView, onChange: (v: MapView) => void, onTap: (p: Point) => void) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [element, setElement] = useState<SVGSVGElement | null>(null);
  const attachRef = useCallback((node: SVGSVGElement | null) => {
    ref.current = node;
    setElement(node);
  }, []);
  const latest = useRef({ view, onChange, onTap }); latest.current = { view, onChange, onTap };
  const pointers = useRef(new Map<number, Point>());
  const blocked = useRef(false), origin = useRef<Point>({ x: 0, y: 0 });
  const position = (x: number, y: number): Point => { const svg = ref.current!; const matrix = svg.getScreenCTM(); if (!matrix) return {x:160,y:160}; const p = new DOMPoint(x,y).matrixTransform(matrix.inverse()); return {x:p.x,y:p.y}; };
  const change = (v: MapView) => { latest.current.view = v; latest.current.onChange(v); };
  const zoom = (factor: number) => change(zoomAt(latest.current.view, factor, { x: 160, y: 160 }));
  useEffect(() => {
    const svg = element; if (!svg) return;
    // macOS WebKit trackpads emit GestureEvents instead of touch pointers.
    // Touchscreens keep the pointer path so one pinch cannot zoom twice.
    type TrackpadGesture = Event & { scale: number; clientX: number; clientY: number };
    let gestureScale: number | null = null;
    const gestureStart = (event: Event) => {
      if (pointers.current.size) return;
      event.preventDefault();
      gestureScale = 1;
      blocked.current = true;
    };
    const gestureChange = (event: Event) => {
      if (gestureScale === null) return;
      event.preventDefault();
      if (pointers.current.size) { gestureScale = null; return; }
      const e = event as TrackpadGesture;
      if (!Number.isFinite(e.scale) || e.scale <= 0) return;
      const anchor = Number.isFinite(e.clientX) && Number.isFinite(e.clientY)
        ? position(e.clientX, e.clientY) : { x: 160, y: 160 };
      change(zoomAt(latest.current.view, e.scale / gestureScale, anchor));
      gestureScale = e.scale;
    };
    const gestureEnd = (event: Event) => {
      if (gestureScale !== null) event.preventDefault();
      gestureScale = null;
    };
    const reset = () => { gestureScale = null; pointers.current.clear(); blocked.current = true; };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (gestureScale !== null) return;
      change(zoomAt(latest.current.view, Math.exp(-e.deltaY * .002), position(e.clientX, e.clientY)));
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    svg.addEventListener('gesturestart', gestureStart, { passive: false });
    svg.addEventListener('gesturechange', gestureChange, { passive: false });
    svg.addEventListener('gestureend', gestureEnd, { passive: false });
    window.addEventListener('blur', reset);
    return () => {
      svg.removeEventListener('wheel', wheel);
      svg.removeEventListener('gesturestart', gestureStart);
      svg.removeEventListener('gesturechange', gestureChange);
      svg.removeEventListener('gestureend', gestureEnd);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, [element]);
  const end = (e: PointerEvent<SVGSVGElement>, cancel: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    const tap = !cancel && !blocked.current && pointers.current.size === 1 && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) <= 8;
    const p = position(e.clientX, e.clientY);
    pointers.current.delete(e.pointerId);
    if (cancel) blocked.current = true;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!pointers.current.size) blocked.current = false;
    if (tap) latest.current.onTap(p);
  };
  return { ref, attachRef, zoom, bindings: {
    onPointerDown(e: PointerEvent<SVGSVGElement>) {
      if (e.button !== 0) return;
      if (!pointers.current.size) { blocked.current = false; origin.current = { x: e.clientX, y: e.clientY }; }
      pointers.current.set(e.pointerId, position(e.clientX, e.clientY));
      if (pointers.current.size > 1) blocked.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: PointerEvent<SVGSVGElement>) {
      const old = pointers.current.get(e.pointerId); if (!old) return;
      const before = [...pointers.current.values()], p = position(e.clientX, e.clientY);
      pointers.current.set(e.pointerId, p);
      if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 8) blocked.current = true;
      if (before.length === 1 && blocked.current) change(clampView({ ...latest.current.view, x: latest.current.view.x + p.x - old.x, y: latest.current.view.y + p.y - old.y }));
      if (before.length === 2) {
        const after = [...pointers.current.values()];
        const middle = (a: Point[]) => ({ x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 });
        const distance = (a: Point[]) => Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        change(zoomAt(latest.current.view, distance(after) / Math.max(1, distance(before)), middle(before), middle(after)));
      }
    },
    onPointerUp: (e: PointerEvent<SVGSVGElement>) => end(e, false),
    onPointerCancel: (e: PointerEvent<SVGSVGElement>) => end(e, true),
    onLostPointerCapture: (e: PointerEvent<SVGSVGElement>) => end(e, true),
  } };
}
