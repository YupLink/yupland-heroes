// Метка маршрута («N шаг · цена · Идти») висит над целевой клеткой.
// Позицию ей выставляет кадр карты — считать её в React значило бы ререндер
// на каждый кадр камеры.
import { axialToPixel } from "./hexGeometry";

type BadgeInput = {
  badgeRef: React.RefObject<HTMLDivElement | null>;
  wrapRef: React.RefObject<HTMLDivElement | null>;
  pendingPathTarget: { q: number; r: number } | null;
  offsetRef: React.RefObject<{ x: number; y: number }>;
  scaleRef: React.RefObject<number>;
  centerQ: number;
  c0q: number;
};

/** Метка маршрута висит над целевой клеткой и едет вместе с картой. */
export function placeBadge(s: BadgeInput): void {
  const el = s.badgeRef.current;
  if (!el) return;
  const t = s.pendingPathTarget;
  const wrap = s.wrapRef.current;
  if (!t || !wrap) return;
  const offset = s.offsetRef.current ?? { x: 0, y: 0 };
  const scale = s.scaleRef.current ?? 1;
  const p = axialToPixel(t.q, t.r, s.centerQ, s.c0q);
  // Плашка с платой за ворота бывает широкой — прижимаем к краям, чтобы у
  // края экрана строка не уходила за кадр (телефон).
  const half = Math.min(wrap.clientWidth / 2, (el.offsetWidth || 0) / 2 + 8);
  const raw = wrap.clientWidth / 2 + offset.x + p.x * scale;
  const x = Math.max(half, Math.min(wrap.clientWidth - half, raw));
  // Метку поднимаем выше клетки: на 60 px она накрывала саму цель.
  const y = wrap.clientHeight / 2 + offset.y + p.y * scale - 82;
  el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translateX(-50%)`;
  el.style.visibility =
    x < -50 || x > wrap.clientWidth + 50 || y < -100 || y > wrap.clientHeight + 50
      ? "hidden"
      : "visible";
}
