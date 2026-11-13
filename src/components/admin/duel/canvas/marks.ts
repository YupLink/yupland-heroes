// Разметка клеток в ход человека — заливкой и контуром, без подсветки и свечения:
// куда дойти (клетки со светлой рамкой — Ярослав 08.11: «плохо ходы подсвечены,
// приходится разглядывать»), кого можно ударить (красная рамка), чей ход (золотая),
// под курсором — путь точками и цель. До боя — зона расстановки: свои клетки в
// рамке, свои бойцы синей рамкой, выбранный — золотой. Заливка — в тон земли
// (tone.ts): на светлой — тенью, на тёмной — светлым.
import { parseKey } from "@/lib/duel/grid";
import { unitById } from "@/lib/duel/options";
import { inDeployZone } from "@/lib/duel/engine";
import type { DuelState, Pos, Side, SpellId, Unit } from "@/lib/duel/types";
import { CELLS, cellPath, xy } from "../fx/layout";
import type { Plan } from "../fx/plan";
import { INK, type Ink, type Tone } from "./tone";

export const SPELL_COLOR: Record<SpellId | "defend", string> = {
  atk: "#f97316",
  def: "#22d3ee",
  defend: "#60a5fa",
};
const GOLD = "#facc15";
const FOE = "#ef4444";
const MINE = "#60a5fa";

export type Marks = {
  reach: ReadonlyMap<string, number>;
  /** Чей ход; во время раскадровки — никого. */
  current: Unit | null;
  /** Кого можно ударить или на кого наложить выбранное заклинание. */
  targets: Unit[];
  spell: SpellId | null;
  plan: Plan | null;
  now: number;
  /** До боя: чья зона расстановки и кто выбран; в бою — пусто. */
  deploy?: { side: Side; picked: string | null } | null;
  /** Тон земли под полем. */
  tone: Tone;
};

function cell(
  g: CanvasRenderingContext2D,
  p: Pos,
  fill: string | null,
  stroke: string | null,
  w = 2,
) {
  cellPath(g, p, 2.5);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = w;
    g.stroke();
  }
}

function dot(g: CanvasRenderingContext2D, p: Pos) {
  const c = xy(p);
  g.beginPath();
  g.arc(c.x, c.y, 4, 0, Math.PI * 2);
  g.fillStyle = GOLD;
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.7)";
  g.lineWidth = 1.5;
  g.stroke();
}

function drawPlan(
  g: CanvasRenderingContext2D,
  st: DuelState,
  plan: Plan,
  spell: SpellId | null,
  ink: Ink,
) {
  if (plan.t === "move" || plan.t === "attack") {
    for (const p of plan.path.slice(1, plan.t === "move" ? -1 : undefined)) dot(g, p);
  }
  if (plan.t === "move") cell(g, plan.to, ink.moveFill, GOLD, 2.5);
  if (plan.t === "attack" && plan.path.length > 1) cell(g, plan.from, null, GOLD, 2.5);
  const target = plan.t === "move" ? null : unitById(st, plan.target);
  if (target) {
    const color = plan.t === "cast" ? SPELL_COLOR[spell ?? plan.spell] : FOE;
    cell(g, target.pos, ink.targetFill, color, 3);
  }
}

function drawDeploy(
  g: CanvasRenderingContext2D,
  st: DuelState,
  side: Side,
  picked: string | null,
  ink: Ink,
) {
  for (const p of CELLS) if (inDeployZone(side, p.c)) cell(g, p, ink.reachFill, ink.reachEdge, 1.5);
  for (const u of st.units) {
    if (u.side !== side || u.hp <= 0) continue;
    cell(g, u.pos, null, u.id === picked ? GOLD : MINE, u.id === picked ? 3.5 : 2.5);
  }
}

export function drawMarks(g: CanvasRenderingContext2D, st: DuelState, m: Marks): void {
  const ink = INK[m.tone];
  if (m.deploy) return drawDeploy(g, st, m.deploy.side, m.deploy.picked, ink);
  for (const k of m.reach.keys()) cell(g, parseKey(k), ink.reachFill, ink.reachEdge, 1.5);
  const color = m.spell ? SPELL_COLOR[m.spell] : FOE;
  for (const t of m.targets) cell(g, t.pos, ink.targetFill, color, 3);
  if (m.current) {
    // Чей ход — золотой контур; мерно дышит, чтобы его было видно сразу.
    g.globalAlpha = 0.65 + 0.35 * Math.sin(m.now / 260);
    cell(g, m.current.pos, null, GOLD, 3);
    g.globalAlpha = 1;
  }
  if (m.plan) drawPlan(g, st, m.plan, m.spell, ink);
}
