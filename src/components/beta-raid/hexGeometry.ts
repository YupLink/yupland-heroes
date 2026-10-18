// Гекс-геометрия для canvas бета-рейда
export const R = 28;
export const SQRT3 = Math.sqrt(3);

export function axialToPixel(q: number, r: number, centerQ: number, c0r: number) {
  return {
    x: R * SQRT3 * (q - centerQ + (r - c0r) / 2),
    y: R * 1.5 * (r - c0r),
  };
}

/**
 * Контур гекса в локальных координатах — строится один раз и переиспользуется.
 * Раньше каждый гекс каждого кадра выкладывался шестью cos/sin.
 * Ленивo: Path2D нет в SSR-окружении, на верхнем уровне создавать нельзя.
 */
let hexPathCache: Path2D | null = null;
export function hexPath2D(): Path2D {
  if (hexPathCache) return hexPathCache;
  const path = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const hx = R * Math.cos(a),
      hy = R * Math.sin(a);
    if (i === 0) path.moveTo(hx, hy);
    else path.lineTo(hx, hy);
  }
  path.closePath();
  hexPathCache = path;
  return path;
}

export function hexPath(g: CanvasRenderingContext2D, x: number, y: number) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const hx = x + R * Math.cos(a),
      hy = y + R * Math.sin(a);
    if (i === 0) g.moveTo(hx, hy);
    else g.lineTo(hx, hy);
  }
  g.closePath();
}

export function hexRound(q: number, r: number) {
  const s = -q - r;
  let rq = Math.round(q),
    rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q),
    dr = Math.abs(rr - r),
    ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

/** Точка отсчёта гекс-сетки по размеру карты — одна формула на карту, кадр и тап. */
export function gridOrigin(mapSize: number): { centerQ: number; c0q: number } {
  const c0q = Math.floor(mapSize / 2);
  return { c0q, centerQ: c0q - Math.floor((c0q - (c0q & 1)) / 2) };
}

export function getCastlePositionAxial(mapSize: number): { q: number; r: number } {
  const center = Math.floor(mapSize / 2);
  const q = center - Math.floor((center - (center & 1)) / 2);
  return { q, r: center };
}

/** Гекс-дистанция в axial-координатах (для радиуса обзора и соседства). */
export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;
}

/**
 * Шесть соседей в axial-координатах. Порядок ЗАКРЕПЛЁН: по нему считается
 * битовая маска дорожной ленты (mapIndex.roadMask) и по ней же выбираются
 * лучи спрайта (roadRibbonCache). Перестановка развернёт дороги на карте.
 */
export const ROAD_DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
] as const;

/** Все клетки внутри гекс-круга радиусом R (axial-координаты). */
export function hexDisc(q: number, r: number, radius: number): Array<{ q: number; r: number }> {
  const out: Array<{ q: number; r: number }> = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const from = Math.max(-radius, -dq - radius);
    const to = Math.min(radius, -dq + radius);
    for (let dr = from; dr <= to; dr++) out.push({ q: q + dq, r: r + dr });
  }
  return out;
}
