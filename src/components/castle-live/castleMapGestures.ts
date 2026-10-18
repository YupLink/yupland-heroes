// One Pointer Events stream for mouse, pen and multi-touch (including Android WebView).
// Camera geometry and zoom limits remain owned by CastleViewport.
type Point = { pointerId: number; clientX: number; clientY: number };
export function castleMapGestures(camera: {
  getScale: () => number;
  zoomTo: (scale: number) => void;
  getScroll: () => { x: number; y: number };
  scrollTo: (position: { x: number; y: number }) => void;
  finish: (moved: boolean) => void;
}) {
  const pointers = new Map<number, Point>();
  let moved = false;
  let base: { x: number; y: number; scroll: { x: number; y: number }; distance: number; scale: number } | null = null;
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return b ? Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) : 0;
  };
  const rebase = () => {
    const first = pointers.values().next().value;
    base = first ? { x: first.clientX, y: first.clientY, scroll: camera.getScroll(), distance: distance(), scale: camera.getScale() } : null;
  };
  return {
    down(point: Point) {
      if (!pointers.size) moved = false;
      pointers.set(point.pointerId, { pointerId: point.pointerId, clientX: point.clientX, clientY: point.clientY });
      // A pinch is always a gesture, even if it hits a zoom limit.
      if (pointers.size > 1) moved = true;
      rebase();
      return [...pointers.keys()];
    },
    move(point: Point) {
      if (!pointers.has(point.pointerId) || !base) return false;
      pointers.set(point.pointerId, { pointerId: point.pointerId, clientX: point.clientX, clientY: point.clientY });
      if (pointers.size > 1) {
        const nextDistance = distance();
        if (base.distance > 0) camera.zoomTo(base.scale * nextDistance / base.distance);
        else rebase(); // Fingers initially coincided; establish a finite baseline.
        moved = true;
      } else {
        const dx = base.x - point.clientX, dy = base.y - point.clientY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
        if (moved) camera.scrollTo({ x: base.scroll.x + dx, y: base.scroll.y + dy });
      }
      return moved;
    },
    up(pointerId: number) {
      if (!pointers.delete(pointerId)) return;
      if (!pointers.size) camera.finish(moved);
      // Continue seamlessly with the remaining finger after a pinch/cancel.
      rebase();
    },
    reset() { pointers.clear(); base = null; moved = false; },
  };
}
