// Номер клетки по (q, r) числовой сеткой — для мест, которым нужны единицы клеток
// (берег у кнопки рыбалки). Сетка живёт, пока жива колонка q: правки карты
// (PackedEdit) колонки координат не трогают, и сетка переживает события боя.
type Coords = { q: ArrayLike<number>; r: ArrayLike<number> };
type Grid = { minQ: number; minR: number; cols: number; rows: number; at: Int32Array };

const grids = new WeakMap<object, Grid>();

function gridOf(p: Coords): Grid {
  const hit = grids.get(p.q as object);
  if (hit) return hit;
  let minQ = Infinity,
    maxQ = -Infinity,
    minR = Infinity,
    maxR = -Infinity;
  const n = p.q.length;
  for (let i = 0; i < n; i++) {
    const q = p.q[i],
      r = p.r[i];
    if (q < minQ) minQ = q;
    if (q > maxQ) maxQ = q;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
  }
  const cols = n ? maxQ - minQ + 1 : 0;
  const rows = n ? maxR - minR + 1 : 0;
  const at = new Int32Array(cols * rows).fill(-1);
  for (let i = 0; i < n; i++) at[(p.r[i] - minR) * cols + (p.q[i] - minQ)] = i;
  const grid = { minQ, minR, cols, rows, at };
  grids.set(p.q as object, grid);
  return grid;
}

/** Номер строки клетки или -1, если такой клетки в карте нет. */
export function cellAt(p: Coords, q: number, r: number): number {
  const g = gridOf(p);
  const c = q - g.minQ,
    w = r - g.minR;
  if (c < 0 || w < 0 || c >= g.cols || w >= g.rows) return -1;
  const i = g.at[w * g.cols + c];
  // Колонку r могли заменить отдельно от q — сверяемся с самой клеткой.
  return i >= 0 && p.q[i] === q && p.r[i] === r ? i : -1;
}
