// Земля поля: текстура местности, где стоит герой, на всём холсте — поле лежит
// прямо на ней, вокруг чуть притемнено. Клетки — гексы, как на карте (владелец
// 09.11.2026), рамка — в цвет, который виден на этой земле (tone.ts): на светлой —
// светлая с тёмной обводкой, на тёмной — светлая, а поле чуть светлее земли вокруг.
// Печётся один раз в свой холст (и заново при смене размера или когда догрузилась
// текстура), а кадр кладёт её одним drawImage.
import { CELLS, LH, LW, R, cellPath } from "../fx/layout";
import { INK, type Tone } from "./tone";

/** Земля без текстуры (не догрузилась или её нет): нейтральная утоптанная. */
const BARE = "#6b6a4a";
/** Плитка текстуры — примерно три клетки в ширину. */
const TILE = R * 7;

function fillGround(g: CanvasRenderingContext2D, tex: HTMLImageElement | null): void {
  if (!tex) {
    g.fillStyle = BARE;
    g.fillRect(0, 0, LW, LH);
    return;
  }
  const pattern = g.createPattern(tex, "repeat");
  if (!pattern) return;
  const k = TILE / tex.naturalWidth;
  pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
  g.fillStyle = pattern;
  g.fillRect(0, 0, LW, LH);
}

/** Все клетки поля одним путём — по нему земля остаётся без притемнения. */
function fieldPath(): Path2D {
  const all = new Path2D();
  for (const p of CELLS) cellPath(all, p);
  return all;
}

/** Испечь землю под масштаб scale (логические пиксели → точки экрана). */
export function bakeGround(
  scale: number,
  tex: HTMLImageElement | null,
  tone: Tone,
): HTMLCanvasElement {
  const ink = INK[tone];
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(LW * scale));
  cv.height = Math.max(1, Math.round(LH * scale));
  const g = cv.getContext("2d");
  if (!g) return cv;
  g.scale(scale, scale);
  fillGround(g, tex);
  // Вокруг поля чуть темнее: глаз сразу находит поле, земля остаётся видна.
  g.fillStyle = ink.outside;
  g.fillRect(0, 0, LW, LH);
  const field = fieldPath();
  g.save();
  g.clip(field);
  fillGround(g, tex);
  if (ink.field) {
    g.fillStyle = ink.field;
    g.fill(field);
  }
  g.restore();
  for (const p of CELLS) {
    cellPath(g, p, 1.5);
    if (ink.cellFill) {
      g.fillStyle = ink.cellFill;
      g.fill();
    }
    if (ink.gridUnder) {
      g.strokeStyle = ink.gridUnder;
      g.lineWidth = 2.6;
      g.stroke();
    }
    g.strokeStyle = ink.grid;
    g.lineWidth = 1.2;
    g.stroke();
  }
  return cv;
}
