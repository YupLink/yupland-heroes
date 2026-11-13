// Один барабан во время вращения: настоящая лента символов, которая едет вниз
// (lib/slot/reelMotion.ts — разгон, бег, торможение, отскок). Рисуется без React на
// каждом кадре: четыре клетки, сдвиг и смена картинок — напрямую в DOM, поэтому
// плавно и на телефоне. Плитки окна стоят на месте, едут только символы — как у
// механического барабана. В ожидании бонуса рядом с итогом на ленте лежит «Бонус»:
// он проезжает мимо окна и когда третий выпадет, и когда нет.
import { useEffect, useRef } from "react";
import { ROWS } from "@/lib/slot/lines";
import { rollSymbol } from "@/lib/slot/reels";
import { planStop, positionAt, type StopPlan } from "@/lib/slot/reelMotion";
import { BONUS, symbolOf } from "@/lib/slot/symbols";
import type { SymbolId } from "@/lib/slot/types";

/** Один и тот же псевдослучай для ряда n — лента не меняется, пока едет. */
function fillerAt(seed: number, reel: number, n: number): SymbolId {
  let h = (seed * 374761393 + reel * 668265263 + n * 2246822519) >>> 0;
  return rollSymbol(reel, () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

type Props = {
  reel: number;
  spinId: number;
  /** Что стояло в окне до спина (сверху вниз). */
  prev: SymbolId[];
  /** Итог барабана (сверху вниз) — когда сервер ответил. */
  final: SymbolId[] | null;
  /** Через сколько мс после ответа встать (timing.ts). */
  stopIn: number;
  anticipate: boolean;
  anticipationMs: number;
  /** Барабан доехал до итога (стук) и встал окончательно. */
  onStop: (reel: number) => void;
  onLand: (reel: number) => void;
};

export function ReelColumn(p: Props) {
  const strip = useRef<HTMLDivElement>(null);
  const imgs = useRef<(HTMLImageElement | null)[]>([]);
  const live = useRef(p);
  live.current = p;
  // Первый кадр — ровно то, что стояло в окне до спина (без пустого кадра).
  const first: SymbolId[] = [...p.prev, fillerAt(p.spinId, p.reel, ROWS)];
  const run = useRef({
    start: 0,
    plan: null as StopPlan | null,
    shown: first as string[],
    stopped: false,
  });

  // Новый спин — отсчёт заново.
  useEffect(() => {
    run.current = { start: performance.now(), plan: null, shown: [...first], stopped: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.spinId]);

  // Пришёл итог — план остановки от этого момента.
  useEffect(() => {
    if (!p.final || run.current.plan) return;
    const now = performance.now() - run.current.start;
    run.current.plan = planStop(p.reel, now, p.stopIn, p.anticipate, p.anticipationMs);
  }, [p.final, p.reel, p.stopIn, p.anticipate, p.anticipationMs]);

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const { reel, spinId, prev, final, anticipate } = live.current;
      const r = run.current;
      const t = performance.now() - r.start;
      const { x, stage } = positionAt(t, reel, r.plan);
      const top = -x;
      const n0 = Math.floor(top);
      const frac = top - n0;
      const F = r.plan ? -r.plan.end : Number.NaN;
      for (let j = 0; j < 4; j++) {
        const n = n0 + j;
        const id: SymbolId =
          n >= 0 && n < ROWS
            ? prev[n]
            : final && n >= F && n < F + ROWS
              ? final[n - F]
              : anticipate && (n === F + 3 || n === F - 1)
                ? BONUS
                : fillerAt(spinId, reel, n);
        const img = imgs.current[j];
        if (img && r.shown[j] !== id) {
          img.src = symbolOf(id).img;
          r.shown[j] = id;
        }
      }
      const el = strip.current;
      if (el) {
        el.style.transform = `translate3d(0, ${(-frac * 100) / ROWS}%, 0)`;
        el.dataset.stage = stage;
      }
      if (r.plan && !r.stopped && t >= r.plan.stopAt) {
        r.stopped = true;
        live.current.onStop(reel);
      }
      if (stage === "landed") {
        live.current.onLand(reel);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [p.spinId]);

  return (
    <div className="absolute inset-0">
      {/* Плитки окна неподвижны — едет только лента символов. */}
      <div className="absolute inset-0 grid grid-rows-3">
        {Array.from({ length: ROWS }, (_, i) => (
          <div key={i} className="relative">
            <div
              aria-hidden="true"
              className="slot-reel-tile absolute inset-[4%] rounded-md border border-[#655a43]/50 bg-[radial-gradient(ellipse_at_center,#1b2027,#0c1014_75%)] shadow-[inset_0_0_10px_rgba(0,0,0,0.7)]"
            />
          </div>
        ))}
      </div>
      <div ref={strip} className="slot-reel-band absolute inset-x-0 top-0 h-full" data-stage="run">
        {[0, 1, 2, 3].map((j) => (
          <div
            key={j}
            className="absolute inset-x-0"
            style={{ top: `${(j * 100) / ROWS}%`, height: `${100 / ROWS}%` }}
          >
            <img
              ref={(el) => {
                imgs.current[j] = el;
              }}
              src={symbolOf(first[j]).img}
              alt=""
              decoding="sync"
              className="slot-symbol absolute object-contain"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
