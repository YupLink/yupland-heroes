// Режимы и виды палитры режима бога (вынесено из AdminBrushBar — правило ≤250 строк).
import { Combine, Eraser, MousePointerClick, Paintbrush } from "lucide-react";
import type { GodText } from "./adminCellText";
import type { AssetKind } from "./AdminCellPalette";
import type { AdminMode } from "./useAdminLive";

// Дорога — вторая после местности: она поверх неё и без неё не ставится.
// prettier-ignore
export const KINDS: AssetKind[] = ["terrain", "road", "decoration", "chest", "artifact", "boss", "building"];
/** Дизайнеру на острове — без объектов (сундуков, артефактов, боссов). */
export const LIMITED_KINDS: AssetKind[] = ["terrain", "road", "decoration", "building"];

export const MODES: Array<{ id: AdminMode; label: (t: GodText) => string; Icon: typeof Eraser }> = [
  { id: "inspect", label: (t) => t.modeInspect, Icon: MousePointerClick },
  { id: "paint", label: (t) => t.modePaint, Icon: Paintbrush },
  { id: "erase", label: (t) => t.modeErase, Icon: Eraser },
  { id: "merge", label: (t) => t.modeMerge, Icon: Combine },
];
