import { useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { ChevronRight, Square, X } from "lucide-react";
import { heroSpriteSrc } from "@/lib/gameArt";
import "./raid-lower-actions.css";

type Props = {
  ru: boolean;
  hand: ReactNode;
  backpack: ReactNode;
  spellbook: ReactNode;
  presets: ReactNode;
  action: ReactNode;
  heroSprite?: string | null;
  walking?: boolean;
  canCenter: boolean;
  onCenter: () => void;
  onStop?: () => void;
};

/** The hero button centers the camera and unfolds its related actions. */
export function RaidLowerActions({ ru, hand, backpack, spellbook, presets, action, heroSprite, walking = false, canCenter, onCenter, onStop }: Props) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const activeOpen = open;
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const expand = () => {
    if (!hasOpened) {
      // Establish the closed item styles before the first opening animation.
      flushSync(() => setHasOpened(true));
      panel.current?.getBoundingClientRect();
    }
    setOpen(true);
  };
  return <div className={`raid-lower-actions${activeOpen ? " raid-lower-actions--open" : ""}`} onKeyDown={event => {
    if (event.key === "Escape" && activeOpen) {
      setOpen(false);
      event.stopPropagation();
      requestAnimationFrame(() => toggle.current?.focus());
    }
  }}>
    {action && <div className="raid-lower-actions__context">{action}</div>}
    <button ref={toggle} type="button" className="raid-lower-actions__toggle"
      aria-label={ru ? walking ? activeOpen ? "Остановить героя" : "Остановить героя и раскрыть действия" : activeOpen ? "Показать героя и свернуть действия" : "Показать героя и раскрыть действия" : walking ? activeOpen ? "Stop hero" : "Stop hero and expand actions" : activeOpen ? "Show hero and collapse actions" : "Show hero and expand actions"}
      aria-expanded={activeOpen} aria-controls={panelId} disabled={walking ? !onStop : !canCenter}
      onClick={() => { onCenter(); if (walking) { onStop?.(); expand(); } else if (open) setOpen(false); else expand(); }}>
      {walking ? <><Square className="raid-lower-actions__stop-icon" aria-hidden="true" fill="currentColor" /><span className="raid-lower-actions__stop-label">{ru ? "Стоп" : "Stop"}</span></> : <><img src={heroSpriteSrc(heroSprite)} alt="" draggable={false} /><span className="raid-lower-actions__toggle-mark"><ChevronRight className="raid-lower-actions__glyph raid-lower-actions__glyph--arrow" aria-hidden="true" /><X className="raid-lower-actions__glyph raid-lower-actions__glyph--close" aria-hidden="true" /></span></>}
    </button>
    <div ref={panel} id={panelId} role="group" className="raid-lower-actions__panel" aria-label={ru ? "Действия героя" : "Hero actions"} aria-hidden={!activeOpen} inert={!activeOpen}>
      {hasOpened && <>
        <div className="raid-lower-actions__item">{hand}</div>
        <div className="raid-lower-actions__item">{backpack}</div>
        <div className="raid-lower-actions__item">{spellbook}</div>
        <div className="raid-lower-actions__item">{presets}</div>
      </>}
    </div>
  </div>;
}

