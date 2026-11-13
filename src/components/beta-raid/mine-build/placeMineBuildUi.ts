// Кнопки ✗ / ✓ режима стройки стоят под призраком шахты и едут вместе с картой.
// Позицию выставляет кадр карты (как метке маршрута, placeBadge): считать её в
// React значило бы ререндер на каждый кадр камеры. Призрак ушёл за край экрана —
// кнопки прижимаются к краю и остаются видны: выход из режима есть всегда.
import { R, axialToPixel } from "../hexGeometry";
import { getMineBuild, getMineBuildEl } from "./mineBuildStore";

type UiInput = {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  offsetRef: React.RefObject<{ x: number; y: number }>;
  scaleRef: React.RefObject<number>;
  centerQ: number;
  c0q: number;
};

/** Запас от края карты, px: кнопка не уходит под рамку. */
const EDGE = 8;

export function placeMineBuildUi(s: UiInput): void {
  const el = getMineBuildEl();
  const ghost = getMineBuild()?.ghost;
  const wrap = s.wrapRef.current;
  if (!el || !wrap || !ghost) return;
  const offset = s.offsetRef.current ?? { x: 0, y: 0 };
  const scale = s.scaleRef.current ?? 1;
  const p = axialToPixel(ghost.q, ghost.r, s.centerQ, s.c0q);
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  const halfW = (el.offsetWidth || 0) / 2;
  const h = el.offsetHeight || 0;
  const rawX = W / 2 + offset.x + p.x * scale;
  // Под клеткой: кнопки не закрывают саму шахту.
  const rawY = H / 2 + offset.y + (p.y + R * 1.05) * scale;
  const x = Math.max(halfW + EDGE, Math.min(W - halfW - EDGE, rawX));
  const y = Math.max(EDGE, Math.min(H - h - EDGE, rawY));
  el.style.transform = `translate3d(${Math.round(x - halfW)}px, ${Math.round(y)}px, 0)`;
  el.style.visibility = "visible";
}
