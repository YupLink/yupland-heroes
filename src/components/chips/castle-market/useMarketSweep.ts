import { useEffect, useRef, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import { marketRange } from './marketRange';

type Options = { enabled: boolean; order: string[]; selected: string[]; onChange: (ids: string[]) => void; scrollRef: RefObject<HTMLDivElement | null>; limit?: number };
type Gesture = { pointerId: number; root: HTMLDivElement; base: string[]; order: string[]; anchor: string; adding: boolean; x: number; y: number; originX: number; originY: number; moved: boolean; last: string; frame: number; previousTime: number };

/** Pointer capture supports touch, pen and mouse; taps/keyboard remain available. */
export function useMarketSweep(options: Options) {
  const current = useRef(options); current.current = options;
  const active = useRef<Gesture | null>(null);
  const stop = (rollback = false) => {
    const gesture = active.current;
    if (!gesture) return;
    active.current = null;
    cancelAnimationFrame(gesture.frame);
    if (gesture.root.hasPointerCapture(gesture.pointerId)) gesture.root.releasePointerCapture(gesture.pointerId);
    if (rollback) current.current.onChange(gesture.base);
  };
  const hit = (root: HTMLElement, target: Element | null) => {
    const tile = target?.closest<HTMLButtonElement>('[data-sweep-id]');
    return tile && root.contains(tile) && !tile.disabled ? tile.dataset.sweepId : undefined;
  };
  const update = (gesture: Gesture, id: string) => {
    if (gesture.last === id) return;
    gesture.last = id;
    current.current.onChange(marketRange(gesture.base, gesture.order, gesture.anchor, id, gesture.adding, current.current.limit));
  };
  const tick = (time: number) => {
    const g = active.current;
    let scroll: HTMLElement | null = current.current.scrollRef.current;
    while (scroll && !(scroll.scrollHeight > scroll.clientHeight && /auto|scroll/.test(getComputedStyle(scroll).overflowY))) scroll = scroll.parentElement;
    scroll ??= document.scrollingElement as HTMLElement | null;
    if (!g) return;
    const elapsed = g.previousTime ? Math.min(32, time - g.previousTime) : 16;
    g.previousTime = time;
    if (g.moved && scroll) {
      const bounds = scroll.getBoundingClientRect();
      const box = { top: Math.max(0, bounds.top), bottom: Math.min(window.innerHeight, bounds.bottom), left: bounds.left, right: bounds.right };
      const edge = Math.min(40, (box.bottom - box.top) / 4);
      const speed = g.y < box.top + edge ? -Math.min(1, (box.top + edge - g.y) / edge) : g.y > box.bottom - edge ? Math.min(1, (g.y - box.bottom + edge) / edge) : 0;
      if (g.x >= box.left && g.x <= box.right && speed) scroll.scrollTop += speed * elapsed * .45;
      const id = hit(g.root, document.elementFromPoint(g.x, Math.max(box.top + 1, Math.min(box.bottom - 1, g.y))));
      if (id) update(g, id);
    }
    g.frame = requestAnimationFrame(tick);
  };
  // Ключ порядка — длина и края, а не весь список строкой: у держателей тысячи
  // фишек, и JSON всех id на каждой отрисовке тормозил выбор пальцем.
  const orderKey = `${options.order.length}:${options.order[0] ?? ''}:${options.order[options.order.length - 1] ?? ''}`;
  useEffect(() => { if (!options.enabled) stop(); }, [options.enabled]);
  useEffect(() => { stop(); }, [orderKey]);
  useEffect(() => () => stop(), []);
  return {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (!current.current.enabled || !event.isPrimary || event.button !== 0 || active.current) return;
      const id = hit(event.currentTarget, event.target as Element);
      if (!id || current.current.order.indexOf(id) < 0) return;
      const gesture: Gesture = { pointerId: event.pointerId, root: event.currentTarget, base: [...current.current.selected], order: [...current.current.order], anchor: id, adding: !current.current.selected.includes(id), x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY, moved: false, last: '', frame: 0, previousTime: 0 };
      active.current = gesture;
      event.currentTarget.setPointerCapture(event.pointerId);
      (event.target as Element).closest<HTMLButtonElement>('[data-sweep-id]')?.focus({ preventScroll: true });
      update(gesture, id);
      gesture.frame = requestAnimationFrame(tick);
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const g = active.current;
      if (!g || event.pointerId !== g.pointerId) return;
      g.x = event.clientX; g.y = event.clientY;
      if (Math.hypot(g.x - g.originX, g.y - g.originY) > 6) g.moved = true;
      if (g.moved) { const id = hit(g.root, document.elementFromPoint(g.x, g.y)); if (id) update(g, id); }
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) { if (active.current?.pointerId === event.pointerId) stop(); },
    onPointerCancel() { stop(true); },
    onLostPointerCapture() { stop(true); },
    onDragStart(event: { preventDefault: () => void }) { if (current.current.enabled) event.preventDefault(); },
    onClick(event: MouseEvent<HTMLDivElement>) {
      if (!current.current.enabled || event.detail !== 0) return;
      const id = hit(event.currentTarget, event.target as Element);
      if (id) current.current.onChange(marketRange(current.current.selected, current.current.order, id, id, !current.current.selected.includes(id), current.current.limit));
    },
  };
}
