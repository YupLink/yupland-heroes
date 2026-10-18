// Гексагональные утилиты для редактора карт и рендеринга.

export const SQRT3 = Math.sqrt(3);

export type Axial = { q: number; r: number };
export type Offset = { col: number; row: number };

export const DIRS: Axial[] = [
  { q: +1, r: 0 }, { q: -1, r: 0 },
  { q: 0, r: +1 }, { q: 0, r: -1 },
  { q: +1, r: -1 }, { q: -1, r: +1 },
];

export const key = (q: number, r: number) => `${q},${r}`;
export const parseKey = (k: string): Axial => { const [q, r] = k.split(",").map(Number); return { q, r }; };

// odd-r offset ↔ axial (pointy-top)
export const offsetToAxial = (col: number, row: number): Axial => ({
  q: col - ((row - (row & 1)) >> 1),
  r: row,
});
export const axialToOffset = (q: number, r: number): Offset => ({
  col: q + ((r - (r & 1)) >> 1),
  row: r,
});

export const inBoundsOffset = (o: Offset, size: number) =>
  o.col >= 0 && o.col < size && o.row >= 0 && o.row < size;
export const inBoundsAxial = (a: Axial, size: number) => inBoundsOffset(axialToOffset(a.q, a.r), size);

/**
 * Конвертирует axial координаты (q, r) в пиксельные (x, y).
 * Используется для рендеринга гексов на Canvas.
 * @param q - axial координата q
 * @param r - axial координата r
 * @param R - радиус гекса в пикселях
 * @returns {x, y} пиксельные координаты
 */
export function axialToPixel(q: number, r: number, R: number) {
  return { x: R * SQRT3 * (q + r / 2), y: R * 1.5 * r };
}

/**
 * Конвертирует пиксельные координаты (x, y) в axial (q, r).
 * Используется для определения гекса при клике на Canvas.
 * @param x - пиксельная координата x
 * @param y - пиксельная координата y
 * @param R - радиус гекса в пикселях
 * @returns {q, r} axial координаты
 */
export function pixelToAxial(x: number, y: number, R: number): Axial {
  const qf = ((SQRT3 / 3) * x - (1 / 3) * y) / R;
  const rf = ((2 / 3) * y) / R;
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

export function hexDist(a: Axial, b: Axial) {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}

export const CENTER = (size: number) => {
  const c = Math.floor(size / 2);
  return offsetToAxial(c, c);
};

export const centerKey = (size: number) => { const a = CENTER(size); return key(a.q, a.r); };

// Canvas hex drawing utilities
export function hexPath(g: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

export function drawHex(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, fill: string, stroke: string) {
  hexPath(g, cx, cy, R);
  g.fillStyle = fill; g.fill();
  g.lineWidth = 1; g.strokeStyle = stroke; g.stroke();
}

export function drawHexOutline(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, stroke: string, w: number) {
  hexPath(g, cx, cy, R);
  g.lineWidth = w; g.strokeStyle = stroke; g.stroke();
}

/**
 * A* алгоритм поиска пути между двумя гексами.
 * Используется для прокладки дорог в редакторе карт.
 * @param a - начальная точка
 * @param b - конечная точка
 * @param size - размер карты
 * @param cells - ячейки карты
 * @param roadMode - если true, cost=1 везде (для дорог)
 * @returns массив точек пути или null если путь не найден
 */
export function findPath(
  a: Axial,
  b: Axial,
  size: number,
  cells: Record<string, unknown>,
  roadMode = false
): Axial[] | null {
  if (!inBoundsAxial(a, size) || !inBoundsAxial(b, size)) return null;
  const start = key(a.q, a.r), goal = key(b.q, b.r);
  const cameFrom = new Map<string, string | null>();
  const gScore = new Map<string, number>([[start, 0]]);
  const open: Array<{ k: string; f: number }> = [{ k: start, f: hexDist(a, b) }];
  cameFrom.set(start, null);
  let steps = 0;
  while (open.length && steps++ < 20000) {
    open.sort((x, y) => x.f - y.f);
    const cur = open.shift()!;
    if (cur.k === goal) break;
    const { q, r } = parseKey(cur.k);
    for (const d of DIRS) {
      const nq = q + d.q, nr = r + d.r;
      const na = { q: nq, r: nr };
      if (!inBoundsAxial(na, size)) continue;
      const nk = key(nq, nr);
      const step = roadMode ? 1 : (!!cells[nk] && nk !== goal && nk !== start ? 6 : 1);
      const tentative = (gScore.get(cur.k) ?? 0) + step;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, cur.k);
        gScore.set(nk, tentative);
        open.push({ k: nk, f: tentative + hexDist(na, b) });
      }
    }
  }
  if (!cameFrom.has(goal)) return null;
  const path: Axial[] = [];
  let cur: string | null = goal;
  while (cur) { path.push(parseKey(cur)); cur = cameFrom.get(cur) ?? null; }
  return path.reverse();
}

/**
 * Получить все гексы в радиусе кисти от центральной точки.
 * Форма — гексагональная (не квадрат).
 * @param center - центральная точка
 * @param radius - радиус кисти (1-10)
 * @param size - размер карты
 * @returns массив точек в области кисти
 */
export function getHexesInBrush(center: Axial, radius: number, size: number): Axial[] {
  if (radius <= 1) return [center];
  const result: Axial[] = [center];
  for (let dq = -(radius - 1); dq <= radius - 1; dq++) {
    for (let dr = -(radius - 1); dr <= radius - 1; dr++) {
      if (dq === 0 && dr === 0) continue;
      const ds = -dq - dr;
      if (Math.abs(dq) + Math.abs(dr) + Math.abs(ds) <= 2 * (radius - 1)) {
        const q = center.q + dq;
        const r = center.r + dr;
        if (inBoundsAxial({ q, r }, size)) {
          result.push({ q, r });
        }
      }
    }
  }
  return result;
}
