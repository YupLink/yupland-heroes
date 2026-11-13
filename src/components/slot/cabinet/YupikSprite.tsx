import { useEffect, useState } from "react";
import { vars } from "./shared";
import { notifyDigCue } from "../music/digSounds";

const frames = [
  [0, 0, 332, 316, 140, 308],
  [332, 0, 318, 316, 457, 308],
  [650, 0, 324, 316, 776, 308],
  [974, 0, 280, 316, 1094, 308],
  [0, 316, 332, 308, 140, 615],
  [332, 316, 318, 308, 457, 615],
  [650, 316, 324, 308, 776, 615],
  [974, 316, 280, 308, 1094, 615],
  [0, 624, 338, 294, 139, 907],
  [338, 624, 308, 294, 454, 907],
  [646, 624, 331, 294, 771, 907],
  [977, 624, 277, 294, 1087, 907],
  [0, 918, 331, 315, 126, 1207],
  [331, 918, 311, 315, 448, 1207],
  [642, 918, 344, 315, 745, 1207],
  [986, 918, 268, 315, 1088, 1207],
];
const motions = {
  idle: [
    [0, 420],
    [1, 420],
    [2, 420],
    [3, 420],
  ],
  walk: [
    [4, 130],
    [5, 130],
    [6, 130],
    [7, 130],
  ],
  dig: [
    [8, 150],
    [9, 180],
    [10, 130],
    [11, 230],
    [12, 220],
    [13, 150],
    [14, 160],
    [15, 180],
  ],
};
export type Motion = keyof typeof motions;
export function YupikSprite({ motion }: { motion: Motion }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (motion !== "dig") return;
    if (index === 11) notifyDigCue("shovel");
    if (index === 14) notifyDigCue("soil");
  }, [motion, index]);
  useEffect(() => () => notifyDigCue("stop"), [motion]);
  useEffect(() => {
    const sequence = motions[motion],
      duration = sequence.reduce((n, f) => n + f[1], 0);
    const start = performance.now(),
      reduced = matchMedia("(prefers-reduced-motion:reduce)");
    let timer = 0;
    const tick = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      if (reduced.matches) {
        setIndex(motion === "dig" ? 11 : sequence[0][0]);
        return;
      }
      const elapsed = performance.now() - start;
      let at =
        motion === "dig" ? Math.min(elapsed, duration - 1) : elapsed % duration;
      for (const [frame, ms] of sequence) {
        if (at < ms) {
          setIndex(frame);
          if (motion !== "dig" || elapsed < duration)
            timer = window.setTimeout(tick, Math.max(16, ms - at));
          return;
        }
        at -= ms;
      }
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    reduced.addEventListener("change", tick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
      reduced.removeEventListener("change", tick);
    };
  }, [motion]);
  const [x, y, w, h, fx, fy] = frames[index];
  return (
    <span className="dig-sprite" aria-hidden="true">
      <span
        className="dig-sprite-frame"
        data-frame={index}
        style={vars({
          "--frame-left": (144 - fx + x) / 3.6 + "%",
          "--frame-top": (324 - fy + y) / 3.6 + "%",
          "--frame-width": w / 3.6 + "%",
          "--frame-height": h / 3.6 + "%",
          "--frame-size": (1254 / w) * 100 + "% " + (1254 / h) * 100 + "%",
          "--frame-position":
            (x / (1254 - w)) * 100 + "% " + (y / (1254 - h)) * 100 + "%",
        })}
      />
    </span>
  );
}
