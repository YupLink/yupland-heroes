import { useEffect, useId, useRef, useState } from "react";
import "./raid-preset-quick-access.css";

export type RaidQuickPreset = { id: string; name: string };

type Props = {
  ru: boolean;
  presets: RaidQuickPreset[];
  status?: "ready" | "loading" | "error";
  onRetry?: () => void;
  onSelect: (id: string) => void;
  atCastle?: boolean;
  disabled?: boolean;
};

/** Presentation only. The host supplies saved sets and handles equipping. */
export function RaidPresetQuickAccess({ ru, presets, status = "ready", onRetry, onSelect, atCastle = false, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{ left: string; right: string; bottom: string; maxWidth: string } | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const togglePanel = () => {
    if (open) { setOpen(false); return; }
    const rect = toggle.current?.getBoundingClientRect();
    if (!rect) return;
    const roomRight = window.innerWidth - rect.right - 8;
    setPlacement(roomRight >= 104
      ? { left: "calc(100% + 8px)", right: "auto", bottom: "0", maxWidth: `${Math.min(220, roomRight - 8)}px` }
      : { left: "auto", right: `${rect.right - window.innerWidth + 8}px`, bottom: "calc(100% + 8px)", maxWidth: `${Math.min(220, window.innerWidth - 16)}px` });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !shell.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnResize = () => setOpen(false);
    window.addEventListener("resize", closeOnResize);
    return () => window.removeEventListener("resize", closeOnResize);
  }, [open]);

  return <div ref={shell} className={`raid-preset-access${atCastle ? " raid-preset-access--at-castle" : ""}`} onKeyDown={event => {
    if (event.key === "Escape" && open) { setOpen(false); event.stopPropagation(); }
  }}>
    <button ref={toggle} type="button" className="raid-preset-access__toggle" aria-label={ru ? "Комплекты" : "Equipment sets"} title={ru ? "Комплекты" : "Equipment sets"} aria-expanded={open} aria-controls={panelId} disabled={disabled} onClick={togglePanel}>
      <img src="/resources/raid-hud-art-presets.png" alt="" />
    </button>
    {open && <div id={panelId} className="raid-preset-access__panel" style={placement ?? undefined} aria-label={ru ? "Сохранённые комплекты" : "Saved equipment sets"}>
      {status === "loading" ? <span role="status" className="raid-preset-access__message">{ru ? "Загрузка…" : "Loading…"}</span>
        : status === "error" ? <span role="alert" className="raid-preset-access__message">{ru ? "Не удалось загрузить комплекты" : "Could not load sets"}{onRetry && <button type="button" onClick={onRetry}>{ru ? "Повторить" : "Retry"}</button>}</span>
        : presets.length === 0 ? <span className="raid-preset-access__message">{ru ? "Комплектов пока нет" : "No saved sets yet"}</span>
        : presets.map(preset => <button key={preset.id} type="button" className="raid-preset-access__chip" disabled={disabled} onClick={() => { setOpen(false); onSelect(preset.id); requestAnimationFrame(() => toggle.current?.focus()); }}>{preset.name}</button>)}
    </div>}
  </div>;
}
