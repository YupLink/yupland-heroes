// Выбранный маршрут — стрелки от гекса к гексу (та же пиксельная стрелка,
// что лежит в public/route-arrow.png, повёрнутая по направлению шага).
// Рисуется до подтверждения: игрок видит, каким путём пойдёт герой.
import { R } from "./hexGeometry";
import type { DrawScene } from "./betaCanvasScene";

const ROUTE = "#46d160";
const HEAD = R * 0.3;

/** Картинка стрелки между клетками: середина отрезка, поворот по ходу. */
function arrowImage(
  g: CanvasRenderingContext2D,
  img: HTMLImageElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const w = R * 1.15;
  const h = w * (img.naturalHeight / img.naturalWidth || 1);
  g.save();
  g.translate(from.x + dx / 2, from.y + dy / 2);
  g.rotate(Math.atan2(dy, dx));
  g.drawImage(img, -w / 2, -h / 2, w, h);
  g.restore();
}

/**
 * Запасной вариант, пока картинка не загрузилась.
 * Тень рисуем отдельным проходом тёмного цвета, а НЕ shadowBlur: на Android
 * WebView shadowBlur = GPU Gaussian blur за каждый stroke.
 */
function arrow(
  g: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const gap = R * 0.42;
  const sx = from.x + ux * gap;
  const sy = from.y + uy * gap;
  const ex = to.x - ux * gap;
  const ey = to.y - uy * gap;

  // Тёмная подложка — вместо shadowBlur (GPU-убийца на мобильных).
  const DARK = "rgba(6, 10, 16, 0.85)";
  const offX = 1.5;
  const offY = 1.5;
  g.strokeStyle = DARK;
  g.fillStyle = DARK;
  g.beginPath();
  g.moveTo(sx + offX, sy + offY);
  g.lineTo(ex + offX, ey + offY);
  g.stroke();
  const a = Math.atan2(uy, ux);
  g.beginPath();
  g.moveTo(ex + offX, ey + offY);
  g.lineTo(ex + offX - HEAD * Math.cos(a - Math.PI / 7), ey + offY - HEAD * Math.sin(a - Math.PI / 7));
  g.lineTo(ex + offX - HEAD * Math.cos(a + Math.PI / 7), ey + offY - HEAD * Math.sin(a + Math.PI / 7));
  g.closePath();
  g.fill();

  // Основная стрелка поверх тени.
  g.strokeStyle = ROUTE;
  g.fillStyle = ROUTE;
  g.beginPath();
  g.moveTo(sx, sy);
  g.lineTo(ex, ey);
  g.stroke();
  g.beginPath();
  g.moveTo(ex, ey);
  g.lineTo(ex - HEAD * Math.cos(a - Math.PI / 7), ey - HEAD * Math.sin(a - Math.PI / 7));
  g.lineTo(ex - HEAD * Math.cos(a + Math.PI / 7), ey - HEAD * Math.sin(a + Math.PI / 7));
  g.closePath();
  g.fill();
}

export function drawRoute(
  scene: DrawScene,
  from: { q: number; r: number },
  path: Array<{ q: number; r: number }>,
): void {
  if (path.length === 0) return;
  const { g, toPixel } = scene;
  g.save();
  g.strokeStyle = ROUTE;
  g.fillStyle = ROUTE;
  g.lineWidth = Math.max(2, R * 0.14);
  g.lineCap = "round";
  g.lineJoin = "round";
  // shadowBlur НЕ используем: тень встроена в спрайт или рисуется вручную (arrow).

  const img = scene.images.get("arrow");
  const ready = !!img && img.complete && img.naturalWidth > 0;

  let prev = toPixel(from.q, from.r);
  for (const step of path) {
    const next = toPixel(step.q, step.r);
    if (ready) arrowImage(g, img!, prev, next);
    else arrow(g, prev, next);
    prev = next;
  }
  g.restore();
}
