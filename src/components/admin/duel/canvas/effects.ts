// Отклик боя: над целью всплывает, сколько сняло (красным «−»), сколько
// вылечило или съедено (зелёным «+»), какое заклинание легло; под ногами —
// круг заклинания; стрела летит дугой; нажатие оставляет круг на месте пальца.
// Время у всплывающих — от часов страницы: они живут дольше хода.
import { unitById } from "@/lib/duel/options";
import type { DuelState, SpellId } from "@/lib/duel/types";
import { R, clamp01, lerp, xy } from "../fx/layout";
import type { Pose } from "../fx/pose";
import { SHOT_MS, type FloatKind, type Timeline } from "../fx/timeline";
import { short, type DuelText } from "../duelText";
import { foodSrc, image, ready } from "./images";
import { SPELL_COLOR } from "./marks";

export type Fx =
  | {
      k: "float";
      at: number;
      x: number;
      y: number;
      kind: FloatKind;
      value: number;
      spell?: SpellId;
    }
  | { k: "ring"; at: number; x: number; y: number; kind: SpellId | "defend" }
  | { k: "food"; at: number; x: number; y: number; image: string | null }
  | { k: "tap"; at: number; x: number; y: number };

const LIFE: Record<Fx["k"], number> = { float: 1150, ring: 650, food: 900, tap: 320 };
const HEAD = R * 1.85;
/** Число всплывает от груди цели: выше — уже фигура ряда над ней, и было бы
 * непонятно, кому сняло. */
const CHEST = R * 0.95;

/** Всплывающее хода — в часах страницы (start — когда пошла раскадровка). */
export function fxOf(tl: Timeline, st: DuelState, start: number): Fx[] {
  const at = (id: string) => {
    const u = unitById(st, id);
    return u ? xy(u.pos) : null;
  };
  const out: Fx[] = [];
  for (const f of tl.floats) {
    const p = at(f.unit);
    if (p)
      out.push({
        k: "float",
        at: start + f.at,
        x: p.x,
        y: p.y - CHEST,
        kind: f.kind,
        value: f.value,
        spell: f.spell,
      });
  }
  for (const r of tl.rings) {
    const p = at(r.unit);
    if (p) out.push({ k: "ring", at: start + r.at, x: p.x, y: p.y + R * 0.45, kind: r.kind });
  }
  const p = tl.eat ? at(tl.eat.unit) : null;
  if (tl.eat && p)
    out.push({ k: "food", at: start + tl.eat.at, x: p.x, y: p.y - HEAD, image: tl.eat.image });
  return out;
}

export const liveFx = (list: Fx[], now: number): Fx[] => list.filter((f) => now < f.at + LIFE[f.k]);

function text(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  g.font = `800 ${size}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 4;
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.strokeText(s, x, y);
  g.fillStyle = color;
  g.fillText(s, x, y);
}

function floatLabel(f: Extract<Fx, { k: "float" }>, t: DuelText): [string, string, number] {
  switch (f.kind) {
    case "dmg":
      return [`−${short(f.value)}`, "#ff5a5a", 22];
    case "heal":
      return [`+${short(f.value)}`, "#4ade80", 22];
    case "buff":
      return [`${t.spell[f.spell ?? "atk"]} +${f.value}%`, SPELL_COLOR[f.spell ?? "atk"], 13];
    case "defend":
      return [t.defend, SPELL_COLOR.defend, 13];
  }
}

export function drawFx(g: CanvasRenderingContext2D, list: Fx[], now: number, t: DuelText): void {
  for (const f of list) {
    const k = (now - f.at) / LIFE[f.k];
    if (k < 0 || k >= 1) continue;
    const fade = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
    if (f.k === "float") {
      const [s, color, size] = floatLabel(f, t);
      const pop = k < 0.12 ? 1.35 - (k / 0.12) * 0.35 : 1;
      g.globalAlpha = fade;
      text(g, s, f.x, f.y - 30 * (1 - (1 - k) ** 2), Math.round(size * pop), color);
    } else if (f.k === "ring") {
      for (const lag of [0, 0.2]) {
        const q = clamp01((k - lag) / (1 - lag));
        if (q <= 0) continue;
        const rx = lerp(R * 0.45, R * 1.05, q);
        g.globalAlpha = 1 - q;
        g.beginPath();
        g.ellipse(f.x, f.y, rx, rx * 0.38, 0, 0, Math.PI * 2);
        g.strokeStyle = SPELL_COLOR[f.kind];
        g.lineWidth = 3;
        g.stroke();
      }
    } else if (f.k === "food") {
      const img = f.image ? image(foodSrc(f.image)) : null;
      if (ready(img)) {
        g.globalAlpha = fade;
        g.drawImage(img, f.x - 14, f.y - 28 * k - 30, 28, 28);
      }
    } else {
      g.globalAlpha = 1 - k;
      g.beginPath();
      g.arc(f.x, f.y, lerp(6, R * 0.55, k), 0, Math.PI * 2);
      g.strokeStyle = "#fff";
      g.lineWidth = 2;
      g.stroke();
    }
  }
  g.globalAlpha = 1;
}

/** Стрела стрелка: дугой от груди стрелка в грудь цели. */
export function drawShot(
  g: CanvasRenderingContext2D,
  st: DuelState,
  tl: Timeline,
  poses: Map<string, Pose>,
  t: number,
): void {
  if (!tl.shot) return;
  const k = (t - tl.shot.t0) / SHOT_MS;
  const from = poses.get(tl.actor);
  const target = unitById(st, tl.shot.target);
  if (k < 0 || k > 1 || !from || !target) return;
  const to = xy(target.pos);
  const lift = R * 0.7;
  const at = (q: number) => ({
    x: lerp(from.x, to.x, q),
    y: lerp(from.y - R * 0.9, to.y - R * 0.8, q) - Math.sin(Math.PI * q) * lift,
  });
  const p = at(k);
  const ahead = at(Math.min(1, k + 0.02));
  const angle = Math.atan2(ahead.y - p.y, ahead.x - p.x);
  g.save();
  g.translate(p.x, p.y);
  g.rotate(angle);
  g.strokeStyle = "#5b3a1a";
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(-16, 0);
  g.lineTo(4, 0);
  g.stroke();
  g.fillStyle = "#e5e7eb";
  g.beginPath();
  g.moveTo(9, 0);
  g.lineTo(2, -4);
  g.lineTo(2, 4);
  g.closePath();
  g.fill();
  g.restore();
}
