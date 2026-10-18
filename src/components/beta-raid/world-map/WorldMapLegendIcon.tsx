// Значок строки легенды карты мира — та же фигура и тот же цвет, что на холсте
// (markSvgPath повторяет путь addMarkPath), герой — золотой круг, замок —
// картинка замка.
import { MAP_ART } from "@/lib/gameArt";
import { markSvgPath } from "./worldMapMarks";
import { HERO_FILL, MARK_STYLE, OUTLINE } from "./worldMapMarkStyle";
import type { WorldLayer } from "./worldMapLayers";

const SVG = "h-3.5 w-3.5 shrink-0 overflow-visible";

export function WorldMapLegendIcon({ layer }: { layer: WorldLayer }) {
  if (layer === "hero") {
    return (
      <svg viewBox="0 0 14 14" className={SVG} aria-hidden>
        <circle cx="7" cy="7" r="5.5" fill={HERO_FILL} stroke={OUTLINE} strokeWidth="2" />
      </svg>
    );
  }
  if (layer === "castle") {
    return (
      <img
        src={MAP_ART.castle}
        alt=""
        className="h-4 w-4 shrink-0 object-contain [image-rendering:pixelated]"
      />
    );
  }
  const style = MARK_STYLE[layer];
  return (
    <svg viewBox="0 0 14 14" className={SVG} aria-hidden>
      <path
        d={markSvgPath(style.shape, 7, 7, 10.5 * (style.scale ?? 1))}
        fill={style.fill}
        stroke={OUTLINE}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
