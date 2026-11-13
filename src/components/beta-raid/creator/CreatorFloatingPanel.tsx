import { useEffect, useRef, type ReactNode } from "react";
import { Grip } from "lucide-react";

type Point = { x: number; y: number };
const ARROWS: Partial<Record<string, Point>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export function CreatorFloatingPanel({
  children,
  className,
  gripLabel,
  hidden,
}: {
  children: ReactNode;
  className: string;
  gripLabel?: string;
  hidden?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const preferred = useRef<Point | null>(null);
  const drag = useRef<{ id: number; start: Point; origin: Point } | null>(null);

  function applyPosition() {
    const panel = root.current;
    const map = panel?.offsetParent;
    const point = preferred.current;
    if (!panel || !map || !point) return;
    const maxX = Math.max(8, map.clientWidth - panel.offsetWidth - 8);
    const maxY = Math.max(8, map.clientHeight - panel.offsetHeight - 8);
    panel.style.left = Math.min(maxX, Math.max(8, point.x)) + "px";
    panel.style.top = Math.min(maxY, Math.max(8, point.y)) + "px";
    panel.style.right = "auto";
  }

  useEffect(() => {
    const panel = root.current;
    if (!panel) return;
    const observer = new ResizeObserver(applyPosition);
    observer.observe(panel);
    window.addEventListener("resize", applyPosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applyPosition);
    };
  }, []);

  function position() {
    return {
      x: root.current?.offsetLeft ?? 0,
      y: root.current?.offsetTop ?? 0,
    };
  }

  return (
    <div
      ref={root}
      className={"creator-dock-float " + className}
      hidden={hidden}
    >
      {gripLabel && (
        <div
          className="creator-dock-grip"
          role="group"
          tabIndex={0}
          aria-label={gripLabel}
          title={gripLabel}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            drag.current = {
              id: event.pointerId,
              start: { x: event.clientX, y: event.clientY },
              origin: position(),
            };
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (!active || active.id !== event.pointerId) return;
            const x = event.clientX - active.start.x;
            const y = event.clientY - active.start.y;
            if (Math.hypot(x, y) < 4 && !preferred.current) return;
            preferred.current = {
              x: active.origin.x + x,
              y: active.origin.y + y,
            };
            applyPosition();
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            const direction = ARROWS[event.key];
            if (!direction) return;
            event.preventDefault();
            const current = position();
            const step = event.shiftKey ? 32 : 8;
            preferred.current = {
              x: current.x + direction.x * step,
              y: current.y + direction.y * step,
            };
            applyPosition();
          }}
        >
          <Grip size={16} aria-hidden="true" />
        </div>
      )}
      {children}
    </div>
  );
}
