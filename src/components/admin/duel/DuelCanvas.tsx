// Поле боя на холсте: земля местности, разметка хода, бойцы и отклик боя.
// Рисуем каждый кадр (бойцы дышат, идут, урон всплывает); земля испечена
// отдельно и кладётся одним drawImage. На телефоне поле держит ширину 560 и
// листается вбок; камера сама держит в центре того, кто ходит (владелец
// 08.11.2026: «при ходе врага камера смещалась бы на него — центрирование»).
import { useEffect, useRef } from "react";
import type { Pos } from "@/lib/duel/types";
import { unitById } from "@/lib/duel/options";
import type { DuelField } from "@/server/api/duel/duel-api";
import { LH, LW, cellAt, xy, type XY } from "./fx/layout";
import { poseAt, type Pose } from "./fx/pose";
import { bakeGround } from "./canvas/ground";
import { toneOf, type Tone } from "./canvas/tone";
import { image, ready, terrainSrc } from "./canvas/images";
import { drawMarks } from "./canvas/marks";
import { drawScene } from "./canvas/units";
import { drawFx, drawShot, liveFx } from "./canvas/effects";
import type { DuelBattleState } from "./useDuelBattle";
import type { DuelText } from "./duelText";

type Size = { scale: number };

/** Сколько камера ведёт к новому бойцу, прежде чем отдать поле пальцу. */
const CAM_LEAD_MS = 800;
const CAM_EASE = 0.14;

/** Камера: ведёт к тому, кто ходит; бьёт или стреляет — к середине между ним и целью. */
function steer(sc: HTMLDivElement, b: DuelBattleState, poses: Map<string, Pose>): void {
  if (sc.scrollWidth <= sc.clientWidth) return;
  const tl = b.anim?.tl;
  const actor = poses.get(tl ? tl.actor : (b.unit?.id ?? ""));
  if (!actor) return;
  const aim = tl ? (tl.lunge ?? tl.shot) : null;
  const target = aim ? unitById(b.view, aim.target) : null;
  const x = target ? (actor.x + xy(target.pos).x) / 2 : actor.x;
  const want = (x / LW) * sc.scrollWidth - sc.clientWidth / 2;
  const goal = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, want));
  const d = goal - sc.scrollLeft;
  const step = d * CAM_EASE;
  sc.scrollLeft += Math.abs(step) < 1 ? d : step;
}

export function DuelCanvas({ d, field, t }: { d: DuelBattleState; field: DuelField; t: DuelText }) {
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const size = useRef<Size | null>(null);
  const hover = useRef<{ cell: Pos; point: XY } | null>(null);
  const live = useRef({ d, t });
  live.current = { d, t };

  useEffect(() => {
    const el = box.current;
    const c = cv.current;
    if (!el || !c) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = (w * LH) / LW;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.style.height = `${h}px`;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      size.current = { scale: (w / LW) * dpr };
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let ground: { key: string; cv: HTMLCanvasElement; tone: Tone } | null = null;
    const tex = field.terrain ? image(terrainSrc(field.terrain)) : null;
    const cam = { turn: null as string | null, until: 0 };
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const c = cv.current;
      const g = c?.getContext("2d");
      const s = size.current;
      if (!c || !g || !s) return;
      const { d: b, t: text } = live.current;
      const now = performance.now();
      const key = `${s.scale}:${ready(tex)}`;
      if (ground?.key !== key) {
        const t = ready(tex) ? tex : null;
        const tone = toneOf(t);
        ground = { key, cv: bakeGround(s.scale, t, tone), tone };
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(ground.cv, 0, 0);
      g.setTransform(s.scale, 0, 0, s.scale, 0, 0);
      const h = hover.current;
      drawMarks(g, b.view, {
        reach: b.reach,
        current: b.unit,
        targets: b.targets,
        spell: b.spell,
        plan: h ? b.plan(h.cell, h.point) : null,
        now,
        deploy: b.deploying ? { side: b.mySide, picked: b.picked } : null,
        tone: ground.tone,
      });
      const tl = b.anim?.tl ?? null;
      const at = b.anim ? now - b.anim.start : 0;
      const poses = drawScene(g, b.view, field.decor, (u) => poseAt(u, b.view, tl, at), now);
      if (tl) drawShot(g, b.view, tl, poses, at);
      drawFx(g, liveFx(b.fx.current, now), now, text);
      const turn = tl ? tl.actor : (b.unit?.id ?? null);
      if (turn !== cam.turn) [cam.turn, cam.until] = [turn, now + CAM_LEAD_MS];
      const sc = scroller.current;
      if (sc && (tl || now < cam.until)) steer(sc, b, poses);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [field]);

  const point = (e: React.MouseEvent<HTMLCanvasElement>): XY => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * LW, y: ((e.clientY - r.top) / r.height) * LH };
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "mouse") return;
    const p = point(e);
    const cell = cellAt(p.x, p.y);
    hover.current = cell ? { cell, point: p } : null;
    e.currentTarget.style.cursor = cell && (d.deploying || d.plan(cell, p)) ? "pointer" : "default";
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = point(e);
    const cell = cellAt(p.x, p.y);
    if (cell) d.tap(cell, p);
  };

  return (
    <div ref={scroller} className="overflow-x-auto rounded-2xl border border-border bg-black">
      <div ref={box} className="relative min-w-[560px]">
        <canvas
          ref={cv}
          className="block w-full touch-manipulation select-none"
          onClick={onClick}
          onPointerMove={onMove}
          onPointerLeave={() => (hover.current = null)}
        />
      </div>
    </div>
  );
}
