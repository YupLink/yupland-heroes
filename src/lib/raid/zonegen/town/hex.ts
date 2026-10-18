// Гекс-геометрия и детерминированный кубик органического поселения.
//
// Спецификация (docs/town-generation-algorithm.json, шаг 0): весь случайный
// выбор идёт от одного PRNG, а ничьи решает хеш клетки, а НЕ порядок обхода
// Map/Set. Порядок обхода зависит от того, в каком порядке клетки пришли с
// клиента, — а тот же сид в той же области обязан дать тот же город клетка в
// клетку и в превью, и при записи на карту.
import { hexToXY, mulberry32 } from "@/lib/raid/zonegen/noise";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";

export const key = (q: number, r: number): string => `${q},${r}`;
export const keyOf = (c: ZoneCell): string => `${c.q},${c.r}`;

export function parseKey(k: string): ZoneCell {
  const i = k.indexOf(",");
  return { q: Number(k.slice(0, i)), r: Number(k.slice(i + 1)) };
}

/**
 * Шесть направлений ПО КРУГУ: соседние индексы — соседние направления. Так
 * угол поворота дороги — это разность индексов × 60°, и штраф поворота из
 * шага 6 (60° +0.3, 120° +0.8) считается без тригонометрии.
 */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export function neighbors(c: ZoneCell): ZoneCell[] {
  return DIRS.map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }));
}

export function neighborKeys(k: string): string[] {
  const c = parseKey(k);
  return DIRS.map(([dq, dr]) => key(c.q + dq, c.r + dr));
}

export function hexDist(a: ZoneCell, b: ZoneCell): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}

/** Индекс направления from→to для соседей; −1, если клетки не соседние. */
export function dirIndex(from: ZoneCell, to: ZoneCell): number {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  return DIRS.findIndex(([q, r]) => q === dq && r === dr);
}

/** Сколько шагов по 60° между двумя направлениями: 0, 1, 2 или 3 (разворот). */
export function turnSteps(a: number, b: number): number {
  const d = Math.abs(a - b) % 6;
  return Math.min(d, 6 - d);
}

/** Число клеток в гекс-круге радиуса R: A(R) = 3R²+3R+1 (R2=19 … R6=127). */
export const hexArea = (radius: number): number => 3 * radius * radius + 3 * radius + 1;

/** Все клетки на расстоянии ≤ radius, в порядке строк (детерминированно). */
export function disk(c: ZoneCell, radius: number): ZoneCell[] {
  const out: ZoneCell[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) out.push({ q: c.q + dq, r: c.r + dr });
  }
  return out;
}

/** Кольцо ровно на расстоянии radius (обход по кругу, как у redblobgames). */
export function ring(c: ZoneCell, radius: number): ZoneCell[] {
  if (radius <= 0) return [{ q: c.q, r: c.r }];
  const out: ZoneCell[] = [];
  let at = { q: c.q + DIRS[4][0] * radius, r: c.r + DIRS[4][1] * radius };
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      out.push(at);
      at = { q: at.q + DIRS[i][0], r: at.r + DIRS[i][1] };
    }
  }
  return out;
}

/** Округление дробного кубического гекса до клетки. */
function roundHex(q: number, r: number): ZoneCell {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

/** Прямая a→b по гексам (линейная интерполяция в кубических координатах). */
export function hexLine(a: ZoneCell, b: ZoneCell): ZoneCell[] {
  const n = hexDist(a, b);
  if (n === 0) return [{ q: a.q, r: a.r }];
  // Сдвиг на эпсилон: без него точки ровно на границе клеток округляются то
  // в одну, то в другую сторону, и линия «дрожит».
  const eq = 1e-6;
  const er = 2e-6;
  const out: ZoneCell[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(roundHex(a.q + eq + (b.q - a.q) * t, a.r + er + (b.r - a.r) * t));
  }
  return out;
}

/** Угол a–center–b в градусах (0…180): «напротив» ли въезды. */
export function angleAt(center: ZoneCell, a: ZoneCell, b: ZoneCell): number {
  const o = hexToXY(center.q, center.r);
  const pa = hexToXY(a.q, a.r);
  const pb = hexToXY(b.q, b.r);
  const ax = pa.x - o.x;
  const ay = pa.y - o.y;
  const bx = pb.x - o.x;
  const by = pb.y - o.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la === 0 || lb === 0) return 0;
  const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Финальное перемешивание murmur3: близкие входы → далёкие выходы. */
function fmix(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Хеш клетки для ничьих: hash(seed, q, r) из шага 0. Не зависит от порядка
 * обхода, поэтому кандидаты с равной оценкой всегда сортируются одинаково.
 */
export function hashCell(seed: number, q: number, r: number): number {
  let h = fmix(seed >>> 0);
  h = fmix((h ^ Math.imul(q | 0, 0x27d4eb2d)) >>> 0);
  return fmix((h ^ Math.imul(r | 0, 0x165667b1)) >>> 0);
}

/**
 * Подсид шага: hash(seed, имя_шага). У каждого шага свой поток жребия —
 * правка одного шага не сдвигает кубик остальных (как SETTLE_SEED_XOR у
 * местности в settlement.ts).
 */
export function subSeed(seed: number, step: string): number {
  let h = fmix((seed >>> 0) ^ 0x9e3779b9);
  for (let i = 0; i < step.length; i++) h = Math.imul(h ^ step.charCodeAt(i), 16777619) >>> 0;
  return fmix(h);
}

/** Кубик шага: mulberry32(hash(seed, шаг)). Math.random здесь не бывает. */
export const rngFor = (seed: number, step: string): (() => number) =>
  mulberry32(subSeed(seed, step));
