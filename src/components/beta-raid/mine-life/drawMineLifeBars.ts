// Полоса службы над шахтой v2 (владелец, 21.10.2026): красная шкала запаса —
// тает от полной к пустой, после починки снова полная, у сломанной — пустая
// рамка. Только шахты v2 (полосы отдаёт сервер, mine-life-bars.ts).
//
// Как в кадре: drawBuilding кладёт в очередь центр, верх картинки и масштаб
// блока (queueMineLifeBar) — значит, полосы есть ровно у нарисованных шахт
// (видимых и разведанных), блок из двух клеток — одна полоса над картинкой.
// После тумана кадр рисует всю очередь тремя заливками: рамки, пустая
// дорожка, красное — по одному fillStyle на проход, без save/restore и
// без теней. На отдалении (зум < 0,5) полос нет.
//
// Место — над флажком шахты: флажок выступает над крышей на 0,44R
// (drawMineFlag, размеры утверждены), полоса выше него и его не закрывает.
//
// Уровень шахты (§8.74) — кружок с цифрой слева от полосы: ещё два прохода
// (подложка, обводка) и по fillText на шахту. Остров (lvl 0) — без кружка.
import { R } from "../hexGeometry";
import { mineBarFrac, type MineBars } from "@/lib/mineLifeBars";
import { getMineBars, mineBarsNow } from "./mineLifeStore";

/** С какого зума рисуем: ниже — значки сводятся к точкам (LOD, как счётчики). */
export const MINE_BAR_MIN_SCALE = 0.5;
/** Ширина полосы — мировые единицы, растёт вместе с блоком (k). */
const BAR_W = R * 1.3;
/** Высота и рамка — в css-пикселях: читается на телефоне при любом зуме. */
const BAR_H_CSS = 6;
const BORDER_CSS = 1;
const GAP_CSS = 2;
/** Насколько флажок шахты выше крыши (drawMineFlag: h·0,42 при h = 1,05R). */
const FLAG_RISE = R * 0.45;

const FRAME = "rgba(8, 11, 18, 0.9)";
const TRACK = "#3d1619";
const FILL = "#e5484d";
/** Кружок уровня: радиус и шрифт — css-пиксели, как полоса. */
const LVL_R_CSS = 6;
const LVL_FONT_CSS = 9;
const LVL_RING = "#f5c451";
const LVL_TEXT = "#fde7a6";

/** Полосы кадра: данные и очередь (x, верх, k, доля, уровень — по 5 чисел на шахту). */
export type MineBarsFrame = { bars: MineBars; now: number; out: number[] };

type Scene = {
  g: CanvasRenderingContext2D;
  scale: number;
  /** Зум × dpr: пикселей устройства на мировую единицу (spriteBucket). */
  bucket: number;
  mineLife?: MineBarsFrame | null;
};

/** Один объект на модуль: кадр не мусорит, очередь чистится в начале кадра. */
const frame: MineBarsFrame = { bars: new Map(), now: 0, out: [] };

/** Полосы этого кадра; null — рисовать нечего (нет данных или далеко). */
export function mineBarsFrame(scale: number, deviceNow = Date.now()): MineBarsFrame | null {
  const bars = getMineBars();
  if (scale < MINE_BAR_MIN_SCALE || bars.size === 0) return null;
  frame.bars = bars;
  frame.now = mineBarsNow(deviceNow);
  frame.out.length = 0;
  return frame;
}

/** Из drawBuilding: шахта с полосой — в очередь кадра. */
export function queueMineLifeBar(
  scene: Pick<Scene, "mineLife">,
  c: { key: string; x: number; k: number },
  top: number,
): void {
  const f = scene.mineLife;
  const bar = f?.bars.get(c.key);
  if (!f || !bar) return;
  f.out.push(c.x, top, c.k, mineBarFrac(bar, f.now), bar.lvl ?? 1);
}

/** Прямоугольники полос, выровненные по пикселям устройства (резкая рамка), + уровень. */
const rects: number[] = [];
const REC = 6;

function layout(scene: Scene, out: readonly number[]): void {
  const s = scene.bucket;
  const u = 1 / scene.scale; // css-пиксель в мировых единицах
  const snap = (v: number) => Math.round(v * s) / s;
  const h = Math.max(3, Math.round(BAR_H_CSS * u * s)) / s;
  rects.length = 0;
  for (let i = 0; i < out.length; i += 5) {
    const x = out[i];
    const k = out[i + 2];
    const w = Math.round(BAR_W * k * s) / s;
    const x0 = snap(x - w / 2);
    const y1 = snap(out[i + 1] - FLAG_RISE * k - GAP_CSS * u);
    rects.push(x0, y1 - h, w, h, out[i + 3], out[i + 4]);
  }
}

/** Кружки уровня слева от полос: подложка, обводка, цифры. */
function drawLevels(scene: Scene): void {
  const { g } = scene;
  const u = 1 / scene.scale;
  const rad = LVL_R_CSS * u;
  let any = false;
  g.beginPath();
  for (let i = 0; i < rects.length; i += REC) {
    if (!(rects[i + 5] > 0)) continue;
    const cx = rects[i] - GAP_CSS * u - rad;
    const cy = rects[i + 1] + rects[i + 3] / 2;
    g.moveTo(cx + rad, cy);
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    any = true;
  }
  if (!any) return;
  g.fillStyle = FRAME;
  g.fill();
  g.lineWidth = Math.max(1, Math.round(scene.bucket / scene.scale)) / scene.bucket;
  g.strokeStyle = LVL_RING;
  g.stroke();
  g.fillStyle = LVL_TEXT;
  g.font = `bold ${LVL_FONT_CSS * u}px sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let i = 0; i < rects.length; i += REC) {
    const lvl = rects[i + 5];
    if (!(lvl > 0)) continue;
    const cx = rects[i] - GAP_CSS * u - rad;
    g.fillText(String(lvl), cx, rects[i + 1] + rects[i + 3] / 2 + 0.5 * u);
  }
}

/** Все полосы очереди: три заливки на кадр, сколько бы шахт ни было. */
export function drawMineLifeBars(scene: Scene): void {
  const f = scene.mineLife;
  if (!f || f.out.length === 0) return;
  const { g } = scene;
  layout(scene, f.out);
  const b = Math.max(1, Math.round(BORDER_CSS * (scene.bucket / scene.scale))) / scene.bucket;
  const minFill = 1 / scene.scale; // работающая — хотя бы css-пиксель красного
  g.beginPath();
  for (let i = 0; i < rects.length; i += REC)
    g.rect(rects[i], rects[i + 1], rects[i + 2], rects[i + 3]);
  g.fillStyle = FRAME;
  g.fill();
  g.beginPath();
  for (let i = 0; i < rects.length; i += REC)
    g.rect(rects[i] + b, rects[i + 1] + b, rects[i + 2] - 2 * b, rects[i + 3] - 2 * b);
  g.fillStyle = TRACK;
  g.fill();
  g.beginPath();
  let any = false;
  for (let i = 0; i < rects.length; i += REC) {
    const frac = rects[i + 4];
    if (!(frac > 0)) continue;
    const iw = rects[i + 2] - 2 * b;
    g.rect(
      rects[i] + b,
      rects[i + 1] + b,
      Math.min(iw, Math.max(minFill, iw * frac)),
      rects[i + 3] - 2 * b,
    );
    any = true;
  }
  if (any) {
    g.fillStyle = FILL;
    g.fill();
  }
  drawLevels(scene);
}
