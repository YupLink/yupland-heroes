// Готовая накладка глухого тумана — печём один раз, кадр кладёт картинку.
//
// Накладка, а не заливка: купол лежит ПОВЕРХ клетки и ничего под собой не
// прячет — местность, дорога, декор и постройка обязаны просвечивать сквозь
// дымку. Поэтому тайл прозрачный, а «глухоту» держит полупрозрачный veil.
//
// Было: на КАЖДУЮ клетку под куполом КАЖДОГО кадра уходили заливка, save,
// clip(гекс), 17 отрезков штриховки, два stroke и restore — около 46 вызовов
// канваса. В обзоре под две сотни гексов, а рисунок у всех одинаков: он не
// зависит ни от координат, ни от того, что лежит под куполом.
//
// Кэш держим модульным, а не внутри HexTileCache: тот хранит тайлы КАРТИНОК
// местности и чистится при их смене, а купола эта смена не касается — ему
// нечего инвалидировать, R и палитра константы.
import { R, hexPath2D } from "./hexGeometry";
import { TILE_DRAW_H, TILE_DRAW_W, TILE_SCALE } from "./hexTileCache";
import { VOID_DOME } from "@/lib/voidDome";

/**
 * Запас по краям тайла: обводка гекса шириной 1.5 наполовину торчит наружу
 * контура. Без запаса края тайла срезали бы её, и зона выглядела бы обгрызенной
 * слева и справа, где гекс упирается в границу картинки.
 */
const PAD = 2;

export const VOID_DRAW_W = TILE_DRAW_W + PAD * 2;
export const VOID_DRAW_H = TILE_DRAW_H + PAD * 2;

let cached: HTMLCanvasElement | null = null;

/**
 * Накладка купола; null — рисовать негде (SSR или контекст не выдали).
 * Вызывающий в этом случае обходится дымкой без штриховки.
 */
export function voidTile(): HTMLCanvasElement | null {
  if (cached) return cached;
  if (typeof document === "undefined") return null;

  const cv = document.createElement("canvas");
  cv.width = Math.ceil(VOID_DRAW_W * TILE_SCALE);
  cv.height = Math.ceil(VOID_DRAW_H * TILE_SCALE);
  const g = cv.getContext("2d");
  if (!g) return null;

  g.setTransform(TILE_SCALE, 0, 0, TILE_SCALE, 0, 0);
  g.translate(VOID_DRAW_W / 2, VOID_DRAW_H / 2);

  const hex = hexPath2D();
  g.fillStyle = VOID_DOME.veil;
  g.fill(hex);
  g.save();
  g.clip(hex);
  g.strokeStyle = VOID_DOME.hatch;
  g.lineWidth = 1.5;
  g.beginPath();
  // Диагональ через всю клетку с шагом 7 — та же штриховка, что рисовалась
  // покадрово; переносим её один в один, чтобы вид не поехал.
  for (let d = -R * 2; d <= R * 2; d += 7) {
    g.moveTo(d, -R);
    g.lineTo(d + R * 2, R);
  }
  g.stroke();
  g.restore();
  g.strokeStyle = VOID_DOME.edge;
  g.lineWidth = 1.5;
  g.stroke(hex);

  cached = cv;
  return cv;
}
