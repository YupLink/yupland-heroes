// Вспышка клетки: «вот она, смотри сюда».
//
// Нужна там, где игрок попал на клетку не тапом по карте, а из списка — из
// окна «Добыча». Камера туда доехала, но среди сотни шестиугольников глазу не
// за что зацепиться: без метки человек ищет свою шахту вручную.
//
// Полторы секунды: одну горит ровно, полсекунды гаснет. Дольше — мешает, но
// короче игрок не успевает перевести взгляд после закрытия окна.
import { R } from "./hexGeometry";

/** Сколько всего живёт метка и сколько из этого занимает угасание, мс. */
export const FLASH_MS = 1500;
const FADE_MS = 1000;

/**
 * ttl — необязательное «живёт эта конкретная вспышка N мс» (панель «Экономика»
 * просит 3 000, встроенная «Добыча» пропускает поле и получает дефолт).
 */
export type FlashMark = { q: number; r: number; start: number; ttl?: number };

const life = (mark: FlashMark): number => Math.max(0, mark.ttl ?? FLASH_MS);

/** Жива ли метка на этот момент — цикл кадров по этому решает, крутиться ли. */
export function flashAlive(mark: FlashMark | null, now: number): boolean {
  return !!mark && now - mark.start < life(mark);
}

type Scene = {
  g: CanvasRenderingContext2D;
  toPixel: (q: number, r: number) => { x: number; y: number };
};

/** Кольцо вокруг клетки, гаснущее к концу жизни метки. */
export function drawFlash(scene: Scene, mark: FlashMark | null, now: number): void {
  if (!flashAlive(mark, now)) return;
  const m = mark as FlashMark;
  const age = now - m.start;
  const total = life(m);
  const fadeStart = Math.max(0, total - FADE_MS);
  // Пока не дошли до угасания — полная яркость, дальше линейно к нулю.
  const fade = age <= fadeStart ? 1 : 1 - (age - fadeStart) / Math.max(1, total - fadeStart);
  const alpha = Math.max(0, Math.min(1, fade));
  const { x, y } = scene.toPixel(m.q, m.r);
  const g = scene.g;

  g.save();
  g.globalAlpha = alpha;
  // Заливка мягкая, обводка яркая: клетка «загорается», а не закрашивается.
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const px = x + R * Math.cos(a);
    const py = y + R * Math.sin(a);
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = "rgba(245, 196, 81, 0.22)";
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = "rgba(245, 196, 81, 0.95)";
  g.stroke();
  g.restore();
}
