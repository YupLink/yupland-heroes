// Снятие фона с картинки генератора. Фон просим белый; его цвет — медиана
// краёв. Заливка идёт от краёв по «похожему на фон»: тот же цвет или
// светло-серое; вторым проходом — серая тень под предметом (у неё нет тёмной
// обводки). Потом связные куски: рамки и линии земли
// (прямые полосы через всю картинку, куски у трёх-четырёх краёв) и пылинки
// (< 2 % главного куска) выкидываем. Белое внутри предмета остаётся: заливка не
// проходит сквозь его тёмный контур. Только у форм с дырами (кольцо, цепочка —
// holes) снимаем и запертый внутри фон. Чистые функции на сыром RGB — без
// sharp, проверяются тестом.

export type ItemBox = { x: number; y: number; w: number; h: number };

export type MaskResult = {
  /** 1 — пиксель предмета. */
  mask: Uint8Array;
  box: ItemBox | null;
  /** Доля краёв цвета фона: фон ровный — около 1. */
  uniform: number;
  /** Доля предмета на картинке. */
  share: number;
  /** Доля главного куска (у пары — двух) в предмете. */
  main: number;
  /** Предмет упирается в край картинки — обрезан. */
  touches: boolean;
};

const near = (a: number[], b: number[], d: number) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < d * d;

function borderIdx(W: number, H: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < W; x++) out.push(x, (H - 1) * W + x);
  for (let y = 1; y < H - 1; y++) out.push(y * W, y * W + W - 1);
  return out;
}

/** Соседи по 4 сторонам (-1 — за краем). */
function nb(i: number, W: number, H: number): [number, number, number, number] {
  const x = i % W;
  return [
    x > 0 ? i - 1 : -1,
    x < W - 1 ? i + 1 : -1,
    i >= W ? i - W : -1,
    i < (H - 1) * W ? i + W : -1,
  ];
}

export function itemMask(rgb: Uint8Array, W: number, H: number, holes = false): MaskResult {
  const N = W * H;
  const px = (i: number) => [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
  const edge = borderIdx(W, H);
  const bgc = [0, 1, 2].map((c) => {
    const v = edge.map((i) => rgb[i * 3 + c]).sort((a, b) => a - b);
    return v[v.length >> 1];
  });
  const uniform = edge.filter((i) => near(px(i), bgc, 40)).length / edge.length;
  const bgLike = (i: number) => {
    const p = px(i);
    if (near(p, bgc, 48)) return true;
    const mx = Math.max(p[0], p[1], p[2]);
    const mn = Math.min(p[0], p[1], p[2]);
    return mn > 140 && mx - mn < 34;
  };

  // Заливка фона от краёв.
  const bg = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  const push = (i: number) => {
    bg[i] = 1;
    stack[sp++] = i;
  };
  for (const i of edge) if (!bg[i] && bgLike(i)) push(i);
  while (sp) {
    for (const j of nb(stack[--sp], W, H)) if (j >= 0 && !bg[j] && bgLike(j)) push(j);
  }
  // Второй проход — тень: серое без цвета (разброс каналов < 22) светлее
  // обводки, примыкающее к фону. У предмета от фона тёмная обводка, у тени её
  // нет. Порог 22 — замер 28.10: при 34 у стального шлема выедает забрало.
  const shadowLike = (i: number) => {
    const p = px(i);
    const spread = Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]);
    return spread < 22 && p[0] + p[1] + p[2] >= 210;
  };
  for (let i = 0; i < N; i++) if (bg[i]) stack[sp++] = i;
  while (sp) {
    for (const j of nb(stack[--sp], W, H)) if (j >= 0 && !bg[j] && shadowLike(j)) push(j);
  }

  // Связные куски не-фона.
  const comp = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  const boxes: number[][] = [];
  for (let s = 0; s < N; s++) {
    if (bg[s] || comp[s] >= 0) continue;
    const id = sizes.length;
    const b = [W, H, -1, -1];
    let n = 0;
    comp[s] = id;
    stack[sp++] = s;
    while (sp) {
      const i = stack[--sp];
      n++;
      const x = i % W;
      const y = (i - x) / W;
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
      for (const j of nb(i, W, H)) {
        if (j < 0 || bg[j] || comp[j] >= 0) continue;
        comp[j] = id;
        stack[sp++] = j;
      }
    }
    sizes.push(n);
    boxes.push(b);
  }
  // Рамка — прямая тонкая полоса через всю картинку (линия земли, край рамки)
  // или кусок, прижатый к трём-четырём краям. Длинное оружие по диагонали
  // (меч, копьё, посох) — тоже «длинное и пустое», но рамкой не считается.
  const frame = boxes.map(([x0, y0, x1, y1]) => {
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const strip = (bw > W * 0.85 && bh < H * 0.1) || (bh > H * 0.85 && bw < W * 0.1);
    const edges = Number(x0 <= 2) + Number(y0 <= 2) + Number(x1 >= W - 3) + Number(y1 >= H - 3);
    return strip || edges >= 3;
  });
  let big = 0;
  for (let k = 0; k < sizes.length; k++) if (!frame[k] && sizes[k] > big) big = sizes[k];
  const keep = sizes.map((n, k) => !frame[k] && big > 0 && n >= big * 0.02);

  const mask = new Uint8Array(N);
  let total = 0;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let k = 0; k < sizes.length; k++) {
    if (!keep[k]) continue;
    total += sizes[k];
    x0 = Math.min(x0, boxes[k][0]);
    y0 = Math.min(y0, boxes[k][1]);
    x1 = Math.max(x1, boxes[k][2]);
    y1 = Math.max(y1, boxes[k][3]);
  }
  for (let i = 0; i < N; i++) if (comp[i] >= 0 && keep[comp[i]]) mask[i] = 1;
  let left = sizes.map((n, k) => (keep[k] ? n : 0));
  if (holes && clearHoles(rgb, W, H, mask, bgc, total) > 0) {
    // Дыры уменьшили куски — доли считаются по тому, что осталось.
    left = new Array<number>(sizes.length).fill(0);
    for (let i = 0; i < N; i++) if (mask[i]) left[comp[i]]++;
    total = left.reduce((a, b) => a + b, 0);
  }
  // Главное — самый большой кусок; у пары (наручи, сапоги, перчатки) второй
  // почти такой же — тогда главное — оба.
  big = 0;
  let second = 0;
  for (const n of left) {
    if (n > big) [big, second] = [n, big];
    else if (n > second) second = n;
  }
  const main = second >= big * 0.35 ? big + second : big;
  const box = total ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
  return {
    mask,
    box,
    uniform,
    share: total / N,
    main: total ? main / total : 0,
    touches: !!box && (x0 <= 1 || y0 <= 1 || x1 >= W - 2 || y1 >= H - 2),
  };
}

/**
 * Дыры: фон, видный сквозь предмет (кольцо, петля цепочки), заливка от краёв
 * не достаёт — он заперт контуром. Дыра — крупная (≥ 3 % предмета) область,
 * почти вся (≥ 97 %) ТОЧНО цвета фона. Белое самого предмета (мех, единорог)
 * затенено: таких «точных» пикселей в нём 4–95 % (замер 26.10), и оно остаётся.
 * Возвращает, сколько пикселей снято.
 */
function clearHoles(
  rgb: Uint8Array,
  W: number,
  H: number,
  mask: Uint8Array,
  bgc: number[],
  total: number,
): number {
  const px = (i: number) => [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
  const seen = new Uint8Array(W * H);
  let removed = 0;
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s] || !near(px(s), bgc, 24)) continue;
    const region: number[] = [s];
    seen[s] = 1;
    let exact = 0;
    for (let k = 0; k < region.length; k++) {
      const i = region[k];
      if (near(px(i), bgc, 6)) exact++;
      for (const j of nb(i, W, H)) {
        if (j < 0 || !mask[j] || seen[j] || !near(px(j), bgc, 24)) continue;
        seen[j] = 1;
        region.push(j);
      }
    }
    if (region.length < total * 0.03 || exact < region.length * 0.97) continue;
    for (const i of region) mask[i] = 0;
    removed += region.length;
  }
  return removed;
}

/** Почему картинка не годится (null — годится). Ключи — для журнала задания. */
export function maskProblem(m: MaskResult): string | null {
  if (m.uniform < 0.85) return "bg_not_plain";
  if (!m.box || m.share < 0.02) return "empty";
  if (m.share > 0.75) return "too_big";
  if (m.touches) return "cut_off";
  if (m.main < 0.6) return "scattered";
  return null;
}
