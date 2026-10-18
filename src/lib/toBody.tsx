// Окно — в body, а не туда, где его объявили. Предок с filter, transform или
// backdrop-filter становится опорой для position: fixed: окно «во весь экран»
// сжимается до этого предка и уезжает (07.10: окно клетки режима бога внутри
// панели поверх полноэкранной карты — обрезано сверху и не листается).
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function toBody(node: ReactNode): ReactNode {
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
