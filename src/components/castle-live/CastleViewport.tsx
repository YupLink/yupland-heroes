import type {CastlePurchaseDestination} from './TownHallPurchaseSuccess';
import {ModularCastleViewport} from "./ModularCastleViewport";
// Карта замка занимает весь экран и перемещается во всех направлениях под HUD.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CastleCanvas } from "@/components/castle-editor/CastleCanvas";
import type { Asset, CellMap } from "@/components/castle-editor/types";
import { buildingAt, type Bindings, type Lang } from "@/lib/castleMenus";
import { castleMapGestures } from "./castleMapGestures";
import { fenceCamera } from "./fenceCamera";
import { useBuildingImageBounds } from "./useBuildingImageBounds";

function LegacyCastleViewport({
  cells,
  assets,
  bindings,
  onBuilding,
  lang,
}: {
  cells: CellMap;
  assets: Asset[];
  bindings: Bindings;
  onBuilding: (id: string) => void;
  lang: Lang;
}) {
  const host = useRef<HTMLDivElement>(null);
  const targetScale = useRef(1);
  const cameraTouched = useRef(false);
  const suppressClickUntil = useRef(0);
  const zoomCenter = useRef<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(() => {
    try {
      const stored = localStorage.getItem("castle-map-zoom-v1");
      const value = stored === null ? 1 : Number(stored);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    } catch { return 1; }
  });
  useEffect(() => {
    try { localStorage.setItem("castle-map-zoom-v1", String(zoom)); } catch { /* Storage may be unavailable. */ }
  }, [zoom]);
  const [size, setSize] = useState({ width: 360, height: 640 });
  const [insets, setInsets] = useState({ top: 104, bottom: 48 });
  const imageBounds = useBuildingImageBounds(assets);
  useLayoutEffect(() => {
    const el = host.current!;
    const root = el.closest("main");
    const measure = () => {
      const bounds = el.getBoundingClientRect();
      setSize({ width: el.clientWidth, height: el.clientHeight });
      // Reserve actual HUD height, not the empty space under side rewards.
      const panels = root?.querySelectorAll(".castle-main-hud");
      const panelBottom = Math.max(bounds.top, ...Array.from(panels ?? []).map(p => p.getBoundingClientRect().bottom));
      const rail = root?.querySelector(".castle-resource-dock__rail");
      const next = {
        top: panelBottom > bounds.top ? Math.ceil(panelBottom - bounds.top + 12) : 104,
        bottom: rail ? Math.ceil(bounds.bottom - rail.getBoundingClientRect().top + 12) : 48,
      };
      setInsets(previous => previous.top === next.top && previous.bottom === next.bottom ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const panel of Array.from(root?.querySelectorAll(".castle-main-hud, .castle-resource-dock__rail") ?? [])) observer.observe(panel);
    measure();
    return () => observer.disconnect();
  }, []);
  const camera = useMemo(
    () =>
      fenceCamera(cells, bindings, size.width, size.height, insets, imageBounds, zoom, true),
    [cells, bindings, size, insets, imageBounds, zoom],
  );
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const [x, y, worldWidth] = camera.viewBox.split(" ").map(Number);
    el.scrollLeft = zoomCenter.current === null
      ? camera.scrollLeft
      : (zoomCenter.current.x - x) * camera.width / worldWidth - size.width / 2;
    el.scrollTop = zoomCenter.current === null || !cameraTouched.current
      ? camera.scrollTop
      : (zoomCenter.current.y - y) * camera.width / worldWidth - size.height / 2;
    zoomCenter.current = { x: x + (el.scrollLeft + size.width / 2) * worldWidth / camera.width,
      y: y + (el.scrollTop + size.height / 2) * worldWidth / camera.width };
  }, [camera, size.width, size.height, zoom]);
  const limits = useMemo(() => {
    const scaleAt = (value: number) => {
      const frame = fenceCamera(cells, bindings, size.width, size.height, insets, imageBounds, value);
      return frame.width / Number(frame.viewBox.split(" ")[2]);
    };
    return { min: scaleAt(0), max: scaleAt(1) };
  }, [cells, bindings, size, insets, imageBounds]);
  targetScale.current = camera.width / Number(camera.viewBox.split(" ")[2]);
  const zoomTo = useCallback((scale: number) => {
    if (!Number.isFinite(scale) || limits.max <= limits.min) return;
    const next = Math.max(limits.min, Math.min(limits.max, scale));
    targetScale.current = next;
    setZoom(Math.log(next / limits.min) / Math.log(limits.max / limits.min));
  }, [limits]);
  const zoomToRef = useRef(zoomTo);
  useLayoutEffect(() => { zoomToRef.current = zoomTo; }, [zoomTo]);
  const gestures = useMemo(() => castleMapGestures({
    getScale: () => targetScale.current,
    zoomTo: scale => zoomToRef.current(scale),
    getScroll: () => ({ x: host.current?.scrollLeft ?? 0, y: host.current?.scrollTop ?? 0 }),
    scrollTo: position => { if (host.current) { host.current.scrollLeft = position.x; host.current.scrollTop = position.y; } },
    finish: moved => { if (moved) suppressClickUntil.current = Date.now() + 500; },
  }), []);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch" && event.button !== 0) return;
      cameraTouched.current = true;
      const active = gestures.down(event);
      if (active.length > 1) for (const id of active) el.setPointerCapture(id);
    };
    const move = (event: PointerEvent) => {
      if (!gestures.move(event)) return;
      if (!el.hasPointerCapture(event.pointerId)) el.setPointerCapture(event.pointerId);
      if (event.cancelable) event.preventDefault();
    };
    const up = (event: PointerEvent) => {
      gestures.up(event.pointerId);
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    };
    // Capture on the viewport before SVG hit targets; keep both fingers on it.
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move, { capture: true, passive: false });
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
    el.addEventListener("lostpointercapture", up, true);
    return () => {
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move, true);
      el.removeEventListener("pointerup", up, true);
      el.removeEventListener("pointercancel", up, true);
      el.removeEventListener("lostpointercapture", up, true);
      gestures.reset();
    };
  }, [gestures]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      cameraTouched.current = true;
      if (event.deltaY !== 0) zoomTo(targetScale.current * (event.deltaY > 0 ? .9 : 1.1));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoomTo]);
  const map = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  return (
    <div className="relative min-h-0 flex-1">
      <style>{"[data-map-viewport]::-webkit-scrollbar{display:none}"}</style>
      <div
        ref={host}
        className="absolute inset-0 touch-none overflow-auto overscroll-contain bg-[#141418]"
        style={{ touchAction: "none", userSelect: "none", scrollbarWidth: "none" }}
        onClickCapture={(event) => {
          if (Date.now() > suppressClickUntil.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClickUntil.current = 0;
        }}
        onScroll={(event) => {
          const [x, y, worldWidth] = camera.viewBox.split(" ").map(Number);
          zoomCenter.current = { x: x + (event.currentTarget.scrollLeft + size.width / 2) * worldWidth / camera.width,
            y: y + (event.currentTarget.scrollTop + size.height / 2) * worldWidth / camera.width };
        }}
        data-map-viewport
        aria-label={lang === "ru" ? "Карта замка — перемещение и масштабирование жестами" : "Castle map — pan and pinch to zoom"}
      >
        <div>
          <CastleCanvas
            calmTerrain
            cells={cells}
            assetById={map}
            selected={new Set()}
            activeGroup={null}
            camera={camera}
            labelForCell={(key) => {
              // Блок — одна кнопка для клавиатуры: подпись только у его первой клетки.
              const gid = cells[key]?.groupId;
              if (gid && Object.keys(cells).find((k) => cells[k].groupId === gid) !== key)
                return undefined;
              const id = buildingAt(cells, key);
              return id && map.get(id)?.kind === "building" ? map.get(id)?.name : undefined;
            }}
            onCellClick={(key) => {
              const id = buildingAt(cells, key);
              if (id && map.get(id)?.kind === "building") onBuilding(id);
            }}
          />
        </div>
      </div>
      {!camera.hasGates && (
        <p
          role="status"
          className="absolute bottom-3 left-3 right-3 rounded border bg-card p-2 text-xs"
        >
          {lang === "ru"
            ? "Назначь постройке меню «Ворота», чтобы был выход в мир."
            : "Assign Gates to a building to add an exit to the world."}
        </p>
      )}
    </div>
  );
}

export function CastleViewport(props:Parameters<typeof LegacyCastleViewport>[0]&{modular?:boolean;editing?:boolean;onDone?:()=>void;purchaseDestination?:CastlePurchaseDestination|null}){return props.modular?<ModularCastleViewport {...props}/>:<LegacyCastleViewport {...props}/>;}


