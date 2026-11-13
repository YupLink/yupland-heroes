import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type TouchEvent as ReactTouchEvent } from "react";
import { ChevronDown, Volume2, VolumeX } from "lucide-react";
import { createPortal } from "react-dom";
import { useLang } from "@/lib/i18n";
import type { CastleMusicController } from "@/lib/audio/castleMusicController";
import { SceneMusicControls } from "./SceneMusicControls";
import "./sound-drop.css";

type Frame = { width: number; height: number; left: number; top: number; radius: number };

/** A single stroke runs around the HUD and its expanding sound drop. */
function framePath(frame: Frame, progress: number, effectsDrop = false) {
  const w = frame.width;
  const edge = frame.height - 1;
  const r = frame.radius;
  const x = frame.left;
  const openWidth = effectsDrop && w < 270 ? 140 : 170;
  const soundWidth = 64 + (openWidth - 64) * progress;
  const sx = soundWidth / 170;
  const sy = (22 + 12 * progress) / 34;
  const p = (px: number, py: number) => `${(x + px * sx).toFixed(2)} ${(edge + py * sy).toFixed(2)}`;
  const effectWidth = w < 270 ? 54 : 62;
  const effectLeft = x + soundWidth + 14;
  const e = (px: number, py: number) => `${(effectLeft + px * effectWidth / 170).toFixed(2)} ${(edge + py * 22 / 34).toFixed(2)}`;
  const effectContour = effectsDrop
    ? ` H ${(effectLeft + effectWidth).toFixed(2)} C ${e(159, 0)} ${e(154, 5)} ${e(150, 14)}` +
      ` C ${e(145, 27)} ${e(136, 34)} ${e(118, 34)} H ${(effectLeft + 52 * effectWidth / 170).toFixed(2)}` +
      ` C ${e(34, 34)} ${e(25, 27)} ${e(20, 14)} C ${e(16, 5)} ${e(11, 0)} ${e(0, 0)}`
    : "";
  return `M ${r} .5 H ${w - r} Q ${w - .5} .5 ${w - .5} ${r} V ${edge - r} Q ${w - .5} ${edge} ${w - r} ${edge}${effectContour} H ${x + soundWidth}` +
    ` C ${p(159, 0)} ${p(154, 5)} ${p(150, 14)}` +
    ` C ${p(145, 27)} ${p(136, 34)} ${p(118, 34)} H ${(x + 52 * sx).toFixed(2)}` +
    ` C ${p(34, 34)} ${p(25, 27)} ${p(20, 14)}` +
    ` C ${p(16, 5)} ${p(11, 0)} ${p(0, 0)}` +
    ` H ${r} Q .5 ${edge} .5 ${edge - r} V ${r} Q .5 .5 ${r} .5`;
}

function dropFrostPath(width: number, height: number) {
  const p = (x:number,y:number) => `${x*width/170} ${y*height/34}`;
  return `M0 0 C${p(11,0)} ${p(16,5)} ${p(20,14)} C${p(25,27)} ${p(34,34)} ${p(52,34)} H${118*width/170} C${p(136,34)} ${p(145,27)} ${p(150,14)} C${p(154,5)} ${p(159,0)} ${p(170,0)} Z`;
}

function surfaceBackground(frame: Frame, scene: "castle" | "raid") {
  if (scene === "raid") return "linear-gradient(135deg, #302e26bf, #171d1bd4)";
  if (innerWidth >= 1024) return `linear-gradient(180deg, #141f1dfa 0px, #081213fa ${frame.height}px, #081213f2 ${frame.height + 34}px)`;
  return `linear-gradient(180deg, rgba(20,31,29,.98) 0px, rgba(12,24,23,.94) ${frame.height * .46}px, rgba(8,18,19,.76) ${frame.height * .68}px, rgba(8,18,19,.32) ${frame.height}px, rgba(8,18,19,.85) ${frame.height + 34}px)`;
}

/** One compact drop from the scene HUD; opening replaces its label with the sound controls. */
export function SoundDrop({ player, scene, hidden = false }: {
  player: CastleMusicController;
  scene: "castle" | "raid";
  hidden?: boolean;
}) {
  const ru = useLang() === "ru";
  const [open, setOpen] = useState(false);
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const off = state.muted || state.volume === 0;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mute = useRef<HTMLButtonElement>(null);
  const activeTouch = useRef<number | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [surfaceHost, setSurfaceHost] = useState<Element | null>(null);
  const [outlineProgress, setOutlineProgress] = useState(0);
  const progressRef = useRef(0);

  useLayoutEffect(() => {
    const rootElement = root.current;
    if (!rootElement || hidden) return;
    let observed: Element | null = null;
    const measure = () => {
      const target = scene === "raid" ? rootElement.closest(".raid-hero-group") :
        innerWidth >= 1024 ? rootElement.closest(".castle-desktop-toolbar") : rootElement.closest(".castle-main-hud")?.querySelector(".castle-main-hud__balances");
      if (!target) return;
      if (target !== observed) {
        if (observed) observer.unobserve(observed);
        observer.observe(target);
        observed = target;
        setSurfaceHost(target);
      }
      const box = target.getBoundingClientRect();
      const drop = rootElement.getBoundingClientRect();
      const next = { width: box.width, height: box.height, left: drop.left - box.left, top: drop.top - box.top,
        radius: parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0 };
      setFrame(previous => previous && Object.keys(next).every(key => Math.abs(previous[key as keyof Frame] - next[key as keyof Frame]) < .1) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    measure();
    addEventListener("resize", measure);
    return () => { observer.disconnect(); removeEventListener("resize", measure); };
  }, [scene, hidden]);

  useEffect(() => {
    const target = open ? 1 : 0;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      progressRef.current = target;
      setOutlineProgress(target);
      return;
    }
    const start = performance.now();
    const from = progressRef.current;
    let handle = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 280);
      const eased = 1 - Math.pow(1 - t, 3);
      progressRef.current = from + (target - from) * eased;
      setOutlineProgress(progressRef.current);
      if (t < 1) handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [open]);



  // Track the finger directly: native range dragging can fail in mobile WebViews.
  const setTouchVolume = (input: HTMLInputElement, clientX: number) => {
    const rect = input.getBoundingClientRect();
    if (rect.width > 0) player.setVolume((clientX - rect.left) / rect.width);
  };
  const onTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLInputElement) || event.target.type !== "range") return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    activeTouch.current = touch.identifier;
    setTouchVolume(event.target, touch.clientX);
  };
  const onTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = Array.from(event.changedTouches).find(item => item.identifier === activeTouch.current);
    const input = root.current?.querySelector<HTMLInputElement>(".scene-music-controls input");
    if (touch && input) setTouchVolume(input, touch.clientX);
  };
  const onTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (Array.from(event.changedTouches).some(item => item.identifier === activeTouch.current)) {
      activeTouch.current = null;
    }
  };

  useEffect(() => {
    if (open) mute.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return <div ref={root} className="sound-drop" data-scene={scene} data-open={open} data-effects-drop={scene === "castle" && !hidden} hidden={hidden}>
    <div className="sound-drop__frost-surface" aria-hidden="true" style={{
      width: 64 + ((scene === "castle" && frame && frame.width < 270 ? 140 : 170) - 64) * outlineProgress,
      height: 22 + 12 * outlineProgress,
      clipPath: `path("${dropFrostPath(64 + ((scene === "castle" && frame && frame.width < 270 ? 140 : 170) - 64) * outlineProgress, 22 + 12 * outlineProgress)}")`
    }} />
    {!hidden && frame && surfaceHost && createPortal(<div className="sound-drop__surface" style={{ width: frame.width,
      background: surfaceBackground(frame, scene),
      height: frame.height + 34, clipPath: `path("${framePath(frame, outlineProgress, scene === "castle")} Z")` }} />, surfaceHost)}
    {frame && <svg className="sound-drop__outline" style={{ left: -frame.left, top: -frame.top, width: frame.width, height: frame.height + 34 }}
      viewBox={`0 0 ${frame.width} ${frame.height + 34}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={framePath(frame, outlineProgress, scene === "castle")} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>}
    <button ref={trigger} type="button" className="sound-drop__trigger"
      tabIndex={open ? -1 : 0} aria-label={ru ? "Настройки звука" : "Sound settings"}
      aria-expanded={open} aria-controls={`sound-drop-controls-${scene}`}
      onClick={() => setOpen(true)}>
      {off ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      <ChevronDown aria-hidden="true" />
    </button>
    <div id={`sound-drop-controls-${scene}`} className="sound-drop__controls" inert={!open} aria-hidden={!open}>
      <div className="sound-drop__music" ref={node => { mute.current = node?.querySelector<HTMLButtonElement>(".scene-music-controls__toggle") ?? null; }}
        onTouchStartCapture={onTouchStart} onTouchMoveCapture={onTouchMove}
        onTouchEndCapture={onTouchEnd} onTouchCancelCapture={onTouchEnd}>
        <SceneMusicControls player={player} scene={scene} />
      </div>
      <button type="button" className="sound-drop__close"
        aria-label={ru ? "Свернуть настройки звука" : "Collapse sound settings"}
        onClick={() => { setOpen(false); trigger.current?.focus(); }}>
        <ChevronDown aria-hidden="true" />
      </button>
    </div>
  </div>;
}
