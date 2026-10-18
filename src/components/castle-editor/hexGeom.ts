// Геометрия сетки интерьера: остроконечный верх (pointy-top) — ряды идут
// ровной горизонталью, «скачут» столбцы (odd-r: нечётные ряды сдвинуты
// вправо на полгекса). Так здания встают в линию по горизонтали.
export const COLS = 16;
export const ROWS = 16;
export const HEX_SIZE = 34;

export const cellKey = (q: number, r: number): string => `${q},${r}`;
export const parseKey = (key: string): [number, number] => {
  const [q, r] = key.split(",").map(Number);
  return [q, r];
};

export function hexCenter(q: number, r: number): [number, number] {
  const x = HEX_SIZE * Math.sqrt(3) * (q + (r % 2) / 2) + HEX_SIZE;
  const y = HEX_SIZE * 1.5 * r + HEX_SIZE;
  return [x, y];
}

export function hexPolygonPoints(cx: number, cy: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    // +30° — вершина смотрит вверх.
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    pts.push(`${cx + HEX_SIZE * Math.cos(angle)},${cy + HEX_SIZE * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

// Левое поле = HEX_SIZE·(1 − √3/2); правый край последнего гекса нечётного
// ряда = HEX_SIZE·(√3·COLS + 1). Поле справа делаем таким же, как слева.
const PAD_X = HEX_SIZE * (1 - Math.sqrt(3) / 2);
export const CANVAS_W = HEX_SIZE * (Math.sqrt(3) * COLS + 1) + PAD_X;
export const CANVAS_H = HEX_SIZE * (1.5 * ROWS + 0.5);

/** Шесть соседей клетки в odd-r раскладке (в пределах сетки). */
export function hexNeighbors(q: number, r: number): string[] {
  const odd = r % 2 !== 0;
  const d = odd
    ? [
        [-1, 0],
        [1, 0],
        [0, -1],
        [1, -1],
        [0, 1],
        [1, 1],
      ]
    : [
        [-1, 0],
        [1, 0],
        [-1, -1],
        [0, -1],
        [-1, 1],
        [0, 1],
      ];
  const out: string[] = [];
  for (const [dq, dr] of d) {
    const nq = q + dq;
    const nr = r + dr;
    if (nq >= 0 && nq < COLS && nr >= 0 && nr < ROWS) out.push(cellKey(nq, nr));
  }
  return out;
}

/** Все ли клетки набора связаны через соседей (один сплошной блок). */
export function isConnected(keys: string[]): boolean {
  if (keys.length === 0) return false;
  const set = new Set(keys);
  const seen = new Set<string>([keys[0]]);
  const stack = [keys[0]];
  while (stack.length) {
    const k = stack.pop()!;
    const [q, r] = parseKey(k);
    for (const n of hexNeighbors(q, r)) {
      if (set.has(n) && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size === set.size;
}

/**
 * Прямоугольник, накрывающий набор клеток (для картинки объединённой клетки):
 * картинка постройки рисуется один раз на весь блок.
 */
export function groupBox(keys: string[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const k of keys) {
    const [q, r] = parseKey(k);
    const [cx, cy] = hexCenter(q, r);
    minX = Math.min(minX, cx - HEX_SIZE);
    maxX = Math.max(maxX, cx + HEX_SIZE);
    minY = Math.min(minY, cy - HEX_SIZE);
    maxY = Math.max(maxY, cy + HEX_SIZE);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
