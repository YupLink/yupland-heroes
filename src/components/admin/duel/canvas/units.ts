// Бойцы и препятствия на поле — по глубине (кто ниже, тот впереди). Герой —
// фигуркой с карты (стойка, на ходу — кадры бега), моб — своей картинкой с
// карты: на шаге подпрыгивает, стоя — мерно дышит. Под ногами тень и плашка
// жизней в цвет стороны (поверх всех фигур); светлый «хвост» — только что снятое.
// Поле в перспективе: фигура и камень — в масштабе своей глубины (depthAt), дальний
// ряд меньше ближнего; плашки жизней — одного размера (читаются везде).
import type { DuelState, Unit } from "@/lib/duel/types";
import { R, depthAt, xy } from "../fx/layout";
import type { Pose } from "../fx/pose";
import { short } from "../duelText";
import { decorSrc, image, ready, unitImage } from "./images";
import { SPELL_COLOR } from "./marks";

export const SIDE_COLOR = { a: "#3b82f6", b: "#ef4444" } as const;
const FOOT = R * 0.5;
const HERO_W = R * 3.1;
const MOB_W = R * 2.4;
const MAX_H = R * 3;
const DECOR_W = R * 2;
const DECOR_MAX_H = R * 2.6;
const FRAME = 128;

function shadow(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.beginPath();
  g.ellipse(x, y + FOOT - 1, R * 0.6, R * 0.2, 0, 0, Math.PI * 2);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fill();
}

function drawHero(g: CanvasRenderingContext2D, img: HTMLImageElement, p: Pose): void {
  // Стойка лицом — нижний ряд атласа; бег — верхний (кадры смотрят вправо).
  const sx = p.run === null ? FRAME : p.run * FRAME;
  const sy = p.run === null ? FRAME * 2 : 0;
  const w = HERO_W;
  g.save();
  g.translate(p.x, p.y + FOOT + w * 0.06);
  if (p.faceLeft) g.scale(-1, 1);
  g.drawImage(img, sx, sy, FRAME, FRAME, -w / 2, -w, w, w);
  g.restore();
}

function drawMob(
  g: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: Pose,
  breath: number,
): void {
  let w = MOB_W;
  let h = (w * img.naturalHeight) / img.naturalWidth;
  if (h > MAX_H) [w, h] = [(w * MAX_H) / h, MAX_H];
  g.save();
  g.translate(p.x, p.y + FOOT - p.hop * R * 0.22);
  g.scale(p.faceLeft ? -1 : 1, p.run === null ? breath : 1);
  g.drawImage(img, -w / 2, -h, w, h);
  g.restore();
}

function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function plate(g: CanvasRenderingContext2D, u: Unit, p: Pose): void {
  const w = R * 1.6;
  const h = 14;
  const x = p.baseX - w / 2;
  const y = p.baseY + FOOT + 3;
  const share = (v: number) => Math.max(0, Math.min(1, v / Math.max(1, u.maxHp)));
  box(g, x, y, w, h, 3);
  g.fillStyle = "rgba(10,13,19,0.88)";
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = "#fde68a";
  g.fillRect(x, y, w * share(p.lag), h);
  g.fillStyle = SIDE_COLOR[u.side];
  g.fillRect(x, y, w * share(p.hp), h);
  g.restore();
  box(g, x, y, w, h, 3);
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.lineWidth = 1;
  g.stroke();
  g.font = "700 12px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 2.5;
  g.strokeStyle = "rgba(0,0,0,0.9)";
  g.strokeText(short(p.hp), p.baseX, y + h / 2 + 0.5);
  g.fillStyle = "#fff";
  g.fillText(short(p.hp), p.baseX, y + h / 2 + 0.5);
  const marks = [
    u.buffAtk > 0 ? SPELL_COLOR.atk : null,
    u.buffDef > 0 || u.defending ? SPELL_COLOR.def : null,
  ].filter((c): c is string => !!c);
  marks.forEach((c, i) => {
    g.beginPath();
    g.arc(x - 6, y + h / 2 - i * 9, 4, 0, Math.PI * 2);
    g.fillStyle = c;
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.8)";
    g.stroke();
  });
}

export function drawScene(
  g: CanvasRenderingContext2D,
  st: DuelState,
  decor: string[],
  pose: (u: Unit) => Pose,
  now: number,
): Map<string, Pose> {
  const items: Array<{ y: number; draw: () => void }> = [];
  st.obstacles.forEach((p, i) => {
    const src = decor.length > 0 ? decor[i % decor.length] : null;
    const img = src ? image(decorSrc(src)) : null;
    if (!ready(img)) return;
    const c = xy(p);
    let w = DECOR_W;
    let h = (w * img.naturalHeight) / img.naturalWidth;
    if (h > DECOR_MAX_H) [w, h] = [(w * DECOR_MAX_H) / h, DECOR_MAX_H];
    items.push({
      y: c.y,
      draw: () => {
        const k = depthAt(c.y);
        g.drawImage(img, c.x - (w * k) / 2, c.y + (R * 0.55 - h) * k, w * k, h * k);
      },
    });
  });
  const poses = new Map<string, Pose>();
  st.units.forEach((u, i) => {
    if (u.hp <= 0) return;
    const p = pose(u);
    poses.set(u.id, p);
    if (p.alpha <= 0) return;
    const img = unitImage(u);
    const breath = 1 + 0.03 * Math.sin(now / 520 + i * 1.7);
    items.push({
      y: p.y,
      draw: () => {
        const k = depthAt(p.y);
        g.save();
        g.globalAlpha = p.alpha;
        // Масштаб глубины — вокруг ног бойца.
        g.translate(p.x, p.y);
        g.scale(k, k);
        g.translate(-p.x, -p.y);
        shadow(g, p.x, p.y);
        if (ready(img)) {
          if (u.atlas) drawHero(g, img, p);
          else drawMob(g, img, p, breath);
        }
        g.restore();
      },
    });
  });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  // Плашки — поверх всех фигур: высокая фигура ряда ниже не закрывает жизни
  // того, кто стоит за ней.
  const alive = st.units.filter((u) => (poses.get(u.id)?.alpha ?? 0) > 0);
  alive.sort((a, b) => (poses.get(a.id)?.y ?? 0) - (poses.get(b.id)?.y ?? 0));
  for (const u of alive) {
    const p = poses.get(u.id) as Pose;
    g.globalAlpha = p.alpha;
    plate(g, u, p);
  }
  g.globalAlpha = 1;
  return poses;
}
