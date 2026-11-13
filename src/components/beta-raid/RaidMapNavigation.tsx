import { useRef, useState, type ReactNode } from "react";
import { Square } from "lucide-react";
import type { LiveMapProps } from "./strategic-map/LiveStrategicMapDialog";
import { INITIAL_VIEW } from "./strategic-map/mapViewport";
import { toast } from "sonner";
import { HudRoundButton } from "./HudRoundButton";
import { HudAsyncDialog } from "./HudAsyncDialog";
import { HUD_ART, MAP_ART, heroSpriteSrc } from "@/lib/gameArt";
import { CreatorWorldButton } from "./creator/CreatorWorldButton";
import "./raid-map-navigation.css";

const loadLiveStrategicMapDialog = () => import("./strategic-map/LiveStrategicMapDialog").then(m => ({ default: m.LiveStrategicMapDialog }));

type Props = {
  castleImage?: string; heroSprite?: string | null; showCamera?: boolean; ru: boolean; map: LiveMapProps;
  atCastle: boolean; showCastle: boolean; walking?: boolean; onStop?: () => void;
  onCenter: () => void; canCenter: boolean; onEnterCastle: () => void;
  onShowCastle: () => boolean | void | Promise<boolean | void>; toolAction?: ReactNode; effects?: ReactNode; extraActions?: ReactNode; mapActions?: ReactNode;
};

/** Camera controls never move the hero. Extra map actions have a separate slot. */
export function RaidMapNavigation({ castleImage = MAP_ART.castle, heroSprite, showCamera = true, ru, map, atCastle, showCastle, walking, onStop, onCenter, canCenter, onEnterCastle, onShowCastle, toolAction, effects, extraActions, mapActions }: Props) {
  return <>
    <div className="raid-map-nav">
      <button type="button" className={`raid-map-nav__button raid-map-nav__locate${walking ? " raid-map-nav__locate--stop" : ""}`}
        aria-label={walking ? ru ? "Остановить героя" : "Stop hero" : ru ? "Где я" : "Where am I"}
        title={walking ? ru ? "Остановить героя" : "Stop hero" : ru ? "Где я" : "Where am I"}
        disabled={walking ? !onStop : !canCenter} onClick={walking ? onStop : onCenter}>
        {walking ? <><Square aria-hidden="true" fill="currentColor" /><span>{ru ? "Стоп" : "Stop"}</span></> : <img src={heroSpriteSrc(heroSprite)} alt="" draggable={false} />}
      </button>
      <div className="raid-map-nav__effects">{effects}</div>
      <div className={`raid-map-nav__actions ${atCastle ? "raid-map-nav__actions--at-castle" : ""}`}>
        <div className="raid-map-nav__castle-slot">
          {showCastle && <button type="button" aria-label={ru ? atCastle ? "Войти в замок" : "Показать замок" : atCastle ? "Enter castle" : "Show castle"} className={`raid-map-nav__button raid-map-nav__castle ${atCastle ? "raid-map-nav__button--primary" : "raid-map-nav__castle--away"}`} onClick={async () => {
            if (atCastle) onEnterCastle();
            else if (await onShowCastle() !== false) { toast.info(ru ? "Для входа подойди к замку или ратуше." : "Approach a castle or town hall to enter.", { id: "castle-entry-hint" }); }
          }}><span className="raid-map-nav__castle-art"><img src={castleImage} alt="" /></span>{atCastle && <span>{ru ? "В замок" : "Enter castle"}</span>}</button>}
          {/* Мир креатора — рядом с замком, только у права creator и админа. */}
          <CreatorWorldButton ru={ru} />
        </div>
        {toolAction}
        {!walking && extraActions && <div className="raid-map-nav__context-slot">{extraActions}</div>}
      </div>
      {showCamera && <div className="raid-map-nav__camera"><RaidMiniMapButton ru={ru} map={map} mapActions={mapActions} /></div>}
    </div>
  </>;
}

/** The same map action can sit in the collapsible raid menu. */
export function RaidMiniMapButton({ ru, map, mapActions, art = HUD_ART.map }: { ru: boolean; map: LiveMapProps; mapActions?: ReactNode; art?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState(INITIAL_VIEW);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setExpanded(false); requestAnimationFrame(() => trigger.current?.focus()); };
  return <>
    <HudRoundButton buttonRef={trigger} art={art} label={ru ? "Раскрыть карту" : "Expand map"} onClick={() => setExpanded(true)} />
    {expanded && <HudAsyncDialog load={loadLiveStrategicMapDialog} props={{ ru, map, view, onView: setView, onClose: close, actions: mapActions }} onClose={close} ru={ru} />}
  </>;
}


