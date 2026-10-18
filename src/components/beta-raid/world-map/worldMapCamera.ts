// Камера карты мира: перевод между экраном, картинкой и клетками.
//
// Мир — пиксели картинки (worldMapModel) с x, растянутым на KX: в картинке
// клетка два пикселя в ширину и один в высоту, а у настоящего гекса шаг вдоль
// строки √3·R против 1,5·R между строками. Экран = мир·s + o (CSS-пиксели).
import { hexRound } from "../hexGeometry";

/** Ширина пикселя картинки в высотах строки: (√3/2) / 1,5. */
export const KX = Math.sqrt(3) / 3;

export type Cam = { s: number; ox: number; oy: number };
/** Геометрия картинки из модели: ноль по x и по строкам. */
export type Geo = { hxMin: number; r0: number };
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Pt = { x: number; y: number };

/** Центр клетки в мировых координатах. */
export function cellWorld(geo: Geo, q: number, r: number): Pt {
  return { x: (2 * q + r - geo.hxMin + 1) * KX, y: r - geo.r0 + 0.5 };
}

/** Мир → экран. */
export function toScreen(cam: Cam, p: Pt): Pt {
  return { x: p.x * cam.s + cam.ox, y: p.y * cam.s + cam.oy };
}

/** Клетка под точкой экрана (CSS-пиксели относительно холста). */
export function cellAt(cam: Cam, geo: Geo, sx: number, sy: number): { q: number; r: number } {
  const x = (sx - cam.ox) / cam.s / KX;
  const y = (sy - cam.oy) / cam.s;
  const rf = y - 0.5 + geo.r0;
  const hx = x - 1 + geo.hxMin;
  // hx = 2q + r → q = (hx − r) / 2; округляем кубически, как карта рейда.
  return hexRound((hx - rf) / 2, rf);
}

/** Камера, вписывающая рамку в экран с отступом; крупнее maxS не приближает. */
export function fitCam(box: Box, viewW: number, viewH: number, pad: number, maxS: number): Cam {
  const w = Math.max(1e-6, box.x1 - box.x0);
  const h = Math.max(1e-6, box.y1 - box.y0);
  const fit = Math.min((viewW - 2 * pad) / w, (viewH - 2 * pad) / h);
  const s = Math.min(maxS, Math.max(1e-3, fit));
  return {
    s,
    ox: viewW / 2 - ((box.x0 + box.x1) / 2) * s,
    oy: viewH / 2 - ((box.y0 + box.y1) / 2) * s,
  };
}

/** Зум вокруг точки экрана: точка под пальцем или курсором остаётся на месте. */
export function zoomAt(cam: Cam, s: number, sx: number, sy: number): Cam {
  const k = s / cam.s;
  return { s, ox: sx - (sx - cam.ox) * k, oy: sy - (sy - cam.oy) * k };
}

/** Мир не уезжает за край целиком: на экране остаётся хотя бы keep пикселей карты. */
export function clampCam(cam: Cam, box: Box, viewW: number, viewH: number, keep: number): Cam {
  const left = box.x0 * cam.s + cam.ox;
  const right = box.x1 * cam.s + cam.ox;
  const top = box.y0 * cam.s + cam.oy;
  const bottom = box.y1 * cam.s + cam.oy;
  let { ox, oy } = cam;
  if (right < keep) ox += keep - right;
  else if (left > viewW - keep) ox -= left - (viewW - keep);
  if (bottom < keep) oy += keep - bottom;
  else if (top > viewH - keep) oy -= top - (viewH - keep);
  return ox === cam.ox && oy === cam.oy ? cam : { s: cam.s, ox, oy };
}

/** Ближайшая к точке экрана цель (метка, герой, замок) не дальше maxPx. */
export function nearestTarget<T extends Pt>(
  cam: Cam,
  targets: readonly T[],
  sx: number,
  sy: number,
  maxPx: number,
): T | null {
  let best: T | null = null;
  let bestD = maxPx * maxPx;
  for (const t of targets) {
    const dx = t.x * cam.s + cam.ox - sx;
    const dy = t.y * cam.s + cam.oy - sy;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}
