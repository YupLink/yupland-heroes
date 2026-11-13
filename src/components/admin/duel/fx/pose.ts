// Где и как стоит боец в момент t раскадровки: идёт по клеткам, делает выпад,
// вздрагивает от удара, тает павшим; жизни на полосе сползают после удара.
// Без раскадровки — стоит на своей клетке лицом к врагу.
import { unitById } from "@/lib/duel/options";
import type { DuelState, Unit } from "@/lib/duel/types";
import { clamp01, lerp, xy } from "./layout";
import {
  DEATH_DELAY_MS,
  DEATH_MS,
  HP_MS,
  LAG_DELAY_MS,
  LAG_MS,
  LUNGE_MS,
  STEP_MS,
  type Timeline,
} from "./timeline";

export type Pose = {
  x: number;
  y: number;
  /** Где плашка жизней: клетка или точка пути — без выпада и дрожи. */
  baseX: number;
  baseY: number;
  faceLeft: boolean;
  /** Кадр бега 0..7; null — стоит. */
  run: number | null;
  /** Подскок моба на шаге, 0..1. */
  hop: number;
  alpha: number;
  hp: number;
  /** Жизни до удара — светлый «хвост» полосы, который догоняет. */
  lag: number;
};

const RUN_FRAME_MS = 60;
const SHAKE_MS = 280;
const RECOIL_MS = 140;
/** Насколько выпад тянется к цели: доля расстояния между центрами. */
const LUNGE_REACH = 0.38;

function actorPose(p: Pose, u: Unit, st: DuelState, tl: Timeline, t: number): void {
  const path = tl.path;
  if (path.length > 1) {
    if (t < tl.walkEnd) {
      const i = Math.min(path.length - 2, Math.floor(t / STEP_MS));
      const k = (t - i * STEP_MS) / STEP_MS;
      const a = xy(path[i]);
      const b = xy(path[i + 1]);
      p.x = p.baseX = lerp(a.x, b.x, k);
      p.y = p.baseY = lerp(a.y, b.y, k);
      if (b.x !== a.x) p.faceLeft = b.x < a.x;
      p.run = Math.floor(t / RUN_FRAME_MS) % 8;
      p.hop = Math.sin(Math.PI * k);
      return;
    }
    const end = xy(path[path.length - 1]);
    p.x = p.baseX = end.x;
    p.y = p.baseY = end.y;
  }
  const aim = tl.lunge ?? tl.shot;
  const target = aim ? unitById(st, aim.target) : null;
  if (!aim || !target) return;
  const to = xy(target.pos);
  p.faceLeft = to.x < p.x || (to.x === p.x && u.side === "b");
  const e = t - aim.t0;
  if (tl.lunge && e >= 0 && e <= LUNGE_MS) {
    const k = Math.sin((Math.PI * e) / LUNGE_MS);
    p.x += (to.x - p.x) * LUNGE_REACH * k;
    p.y += (to.y - p.y) * LUNGE_REACH * k;
    p.run = 3;
  } else if (tl.shot && e >= 0 && e <= RECOIL_MS) {
    const d = Math.hypot(to.x - p.x, to.y - p.y) || 1;
    const k = Math.sin((Math.PI * e) / RECOIL_MS) * 4;
    p.x -= ((to.x - p.x) / d) * k;
    p.y -= ((to.y - p.y) / d) * k;
  }
}

export function poseAt(u: Unit, st: DuelState, tl: Timeline | null, t: number): Pose {
  const at = xy(u.pos);
  const p: Pose = {
    x: at.x,
    y: at.y,
    baseX: at.x,
    baseY: at.y,
    faceLeft: u.side === "b",
    run: null,
    hop: 0,
    alpha: 1,
    hp: u.hp,
    lag: u.hp,
  };
  if (!tl) return p;
  if (u.id === tl.actor) actorPose(p, u, st, tl, t);
  for (const h of tl.hits) {
    if (h.unit !== u.id) continue;
    const e = t - h.at;
    if (e < 0) {
      p.hp = p.lag = h.from;
      continue;
    }
    p.hp = lerp(h.from, h.to, clamp01(e / HP_MS));
    p.lag = h.struck ? lerp(h.from, h.to, clamp01((e - LAG_DELAY_MS) / LAG_MS)) : p.hp;
    if (h.struck && e < SHAKE_MS) {
      p.x += Math.sin((e / SHAKE_MS) * Math.PI * 6) * 4 * (1 - e / SHAKE_MS);
    }
    if (h.struck && h.to <= 0) {
      p.alpha = 1 - clamp01((e - DEATH_DELAY_MS) / DEATH_MS);
      p.y += 8 * (1 - p.alpha);
    }
  }
  if (tl.fled === u.side) p.alpha = 1 - clamp01((t - DEATH_DELAY_MS) / DEATH_MS);
  return p;
}
