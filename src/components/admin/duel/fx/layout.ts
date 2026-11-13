// Геометрия холста дуэли в логических пикселях. Клетки — гексы остриём вверх, как
// на карте рейда (владелец 09.11.2026: «стиль даже в бою не меняем — гексы и там и
// тут»), нечётные ряды сдвинуты на полклетки. Поле — в лёгкой перспективе («вот
// пример, как может выглядеть сражение»): поле «с высоты» (fx, fy) ложится на
// экран так, что дальний ряд уже и ниже ближнего. Фигуры масштабируются по
// глубине (depthAt). Сверху — запас под фигурки дальнего ряда, по бокам — земля.
import { COLS, ROWS, type Pos } from "@/lib/duel/types";

/** Мера фигур (от неё — размеры бойцов и эффектов). */
export const R = 30;
/** Гекс ближнего ряда: радиус до вершины и ширина. */
const S = R * 1.2;
const HW = Math.sqrt(3) * S;
/** Смотрим сверху под углом: по глубине поле сжато. */
const FLAT = 0.72;
/** Дальний ряд меньше ближнего во столько раз. */
const FAR = 0.74;
export const TOP = Math.round(R * 2.4);
const SIDE = Math.round(R * 2);
const BOTTOM = Math.round(R * 1.2);

/** Поле «с высоты»: ширина и глубина. */
const FW = HW * (COLS + 0.5);
const FH = S * (1.5 * (ROWS - 1) + 2);

/** Масштаб на глубине fy (0 — дальняя кромка, FH — ближняя). */
const scaleAt = (fy: number): number => FAR + ((1 - FAR) * fy) / FH;
/** y экрана для глубины fy: каждый слой поля — в масштабе своей глубины. */
const screenY = (fy: number): number => TOP + FLAT * (FAR * fy + ((1 - FAR) * fy * fy) / (2 * FH));
/** Глубина по y экрана (обратное к screenY). */
function depthOf(y: number): number {
  const a = (1 - FAR) / (2 * FH);
  const k = (y - TOP) / FLAT;
  return (-FAR + Math.sqrt(Math.max(0, FAR * FAR + 4 * a * k))) / (2 * a);
}

export const LW = Math.ceil(FW + 2 * SIDE);
export const LH = Math.ceil(screenY(FH) + BOTTOM);

export type XY = { x: number; y: number };

const project = (fx: number, fy: number): XY => ({
  x: LW / 2 + (fx - FW / 2) * scaleAt(fy),
  y: screenY(fy),
});

/** Центр клетки на поле «с высоты». */
const flatCenter = (p: Pos): XY => ({
  x: HW * (p.c + 0.5 * (p.r & 1)) + HW / 2,
  y: 1.5 * S * p.r + S,
});

/** Шесть вершин гекса на экране (по часовой, от правой верхней). */
export function cellPoly(p: Pos): XY[] {
  const c = flatCenter(p);
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return project(c.x + S * Math.cos(a), c.y + S * Math.sin(a));
  });
}

/** Центр клетки — там стоят ноги бойца. */
export function xy(p: Pos): XY {
  const c = flatCenter(p);
  return project(c.x, c.y);
}

/** Масштаб фигуры по глубине: по y её ног (дальний ряд — FAR, ближний — 1). */
export function depthAt(y: number): number {
  return scaleAt(Math.max(0, Math.min(FH, depthOf(y))));
}

export const CELLS: Pos[] = Array.from({ length: COLS * ROWS }, (_, i) => ({
  c: i % COLS,
  r: Math.floor(i / COLS),
}));

/** Клетка под точкой: точку — обратно на поле «с высоты», там — ближайший гекс. */
export function cellAt(x: number, y: number): Pos | null {
  const fy = depthOf(y);
  if (!(fy >= 0 && fy <= FH)) return null;
  const px = (x - LW / 2) / scaleAt(fy) + FW / 2 - HW / 2;
  const py = fy - S;
  const qf = ((Math.sqrt(3) / 3) * px - py / 3) / S;
  const rf = ((2 / 3) * py) / S;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const [dq, dr, ds] = [Math.abs(q - qf), Math.abs(r - rf), Math.abs(s - sf)];
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  const c = q + (r - (r & 1)) / 2;
  return c >= 0 && c < COLS && r >= 0 && r < ROWS ? { c, r } : null;
}

/** Контур клетки (inset — отступ внутрь, логические пиксели) — путь холста. */
export function cellPath(g: CanvasRenderingContext2D | Path2D, p: Pos, inset = 0): void {
  const c = xy(p);
  if (!(g instanceof Path2D)) g.beginPath();
  cellPoly(p).forEach((v, i) => {
    const dx = v.x - c.x;
    const dy = v.y - c.y;
    const k = Math.max(0, 1 - inset / (Math.hypot(dx, dy) || 1));
    if (i === 0) g.moveTo(c.x + dx * k, c.y + dy * k);
    else g.lineTo(c.x + dx * k, c.y + dy * k);
  });
  g.closePath();
}

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const clamp01 = (k: number): number => (k < 0 ? 0 : k > 1 ? 1 : k);
