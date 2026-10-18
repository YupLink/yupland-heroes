// Фигуры меток карты мира — одна геометрия на холст и на легенду.
//
// Фигура различает вид даже там, где цвет сливается с местностью; цвет —
// внутри семейства фигур (worldMapMarkStyle). Многоугольники посчитаны раз при
// половине размера 1 (x, y подряд): кадр только масштабирует — ни одного
// массива на метку. Легенда берёт те же контуры строкой пути SVG (markSvgPath),
// и значок в ней ровно тот, что на холсте.

export type MarkShape =
  | "dot"
  | "sq"
  | "tri"
  | "triDown"
  | "diamond"
  | "hex"
  | "ring"
  | "star"
  | "x";

/** Чем рисуем: контекст холста, Path2D или запись пути SVG — нужны только эти команды. */
export type PathSink = Pick<CanvasPath, "moveTo" | "lineTo" | "closePath" | "rect" | "arc">;

const TAU = Math.PI * 2;

/** Толщина плеча крестика — доля половины размера. */
const D = 0.42;

/** Вершины по кругу: n штук, радиусы по очереди, первая — сверху. */
function around(n: number, radii: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * TAU) / n;
    const rad = radii[i % radii.length];
    out.push(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  return out;
}

/** Многоугольники при половине размера 1. Круг, кольцо и квадрат — своими командами. */
const POLY: Readonly<Record<Exclude<MarkShape, "dot" | "ring" | "sq">, readonly number[]>> = {
  tri: [0, -1, 1, 0.85, -1, 0.85],
  triDown: [-1, -0.85, 1, -0.85, 0, 1],
  // Ромб и звезда чуть крупнее: при той же рамке у них меньше площади.
  diamond: [0, -1.15, 1.15, 0, 0, 1.15, -1.15, 0],
  hex: around(6, [1.05]),
  star: around(10, [1.25, 0.52]),
  // Крестик одним контуром — 12 вершин по часовой от верхнего левого плеча:
  // заливка и обводка без линий внутри, как у остальных меток.
  x: [
    [-1 + D, -1],
    [0, -D],
    [1 - D, -1],
    [1, -1 + D],
    [D, 0],
    [1, 1 - D],
    [1 - D, 1],
    [0, D],
    [-1 + D, 1],
    [-1, 1 - D],
    [-D, 0],
    [-1, -1 + D],
  ].flat(),
};

/** Доля внутреннего радиуса кольца. */
const RING_HOLE = 0.45;
/**
 * Мельче этого кольцо рисуется кругом: дырка с двумя обводками съела бы цвет,
 * и издалека портал выглядел бы чёрной точкой (упрощение при мелком зуме).
 */
const RING_MIN = 9;

/** Контур метки в точке (x, y) размером size — в путь холста, Path2D или SVG. */
export function addMarkPath(
  p: PathSink,
  shape: MarkShape,
  x: number,
  y: number,
  size: number,
): void {
  const h = size / 2;
  if (shape === "dot" || shape === "ring") {
    p.moveTo(x + h, y);
    p.arc(x, y, h, 0, TAU);
    if (shape === "ring" && size >= RING_MIN) {
      // Дырка — против часовой: заливка nonzero её не закрашивает, обводка обводит.
      p.moveTo(x + h * RING_HOLE, y);
      p.arc(x, y, h * RING_HOLE, 0, TAU, true);
    }
    return;
  }
  if (shape === "sq") {
    p.rect(x - h, y - h, size, size);
    return;
  }
  const v = POLY[shape];
  p.moveTo(x + v[0] * h, y + v[1] * h);
  for (let i = 2; i < v.length; i += 2) p.lineTo(x + v[i] * h, y + v[i + 1] * h);
  p.closePath();
}

const n2 = (v: number): number => Math.round(v * 100) / 100;

/** Запись команд пути в строку SVG `d`. Дуги здесь только полные круги. */
function svgSink(): PathSink & { d: string } {
  const s = {
    d: "",
    moveTo(x: number, y: number) {
      s.d += `M${n2(x)} ${n2(y)}`;
    },
    lineTo(x: number, y: number) {
      s.d += `L${n2(x)} ${n2(y)}`;
    },
    closePath() {
      s.d += "Z";
    },
    rect(x: number, y: number, w: number, h: number) {
      s.d += `M${n2(x)} ${n2(y)}h${n2(w)}v${n2(h)}h${n2(-w)}Z`;
    },
    arc(cx: number, cy: number, r: number, _a0: number, _a1: number, ccw?: boolean) {
      // По часовой на экране — флаг 1, как arc холста без ccw.
      const f = ccw ? 0 : 1;
      const [x0, x1, y, rr] = [n2(cx + r), n2(cx - r), n2(cy), n2(r)];
      s.d += `M${x0} ${y}A${rr} ${rr} 0 1 ${f} ${x1} ${y}A${rr} ${rr} 0 1 ${f} ${x0} ${y}Z`;
    },
  };
  return s;
}

/** Та же фигура строкой пути SVG — для значка в легенде. */
export function markSvgPath(shape: MarkShape, x: number, y: number, size: number): string {
  const sink = svgSink();
  addMarkPath(sink, shape, x, y, size);
  return sink.d;
}
