// Сетка барабанов мягкой тяги (reelLevel.ts): 101 набор от холодного (линии 8 %)
// через обычный (33 %, reels.ts) до горячего (120 %). Набор i — смесь обычного с
// крайним (reelSets.ts) в долях; «Бонус» на каждом барабане — всегда доля обычного
// набора, поэтому бонус и супер-игра выпадают одинаково часто на любом наборе.
// Отдача линий каждого набора посчитана заранее (точный расчёт rtp.ts занимает
// ~10 мс на набор) — сверяет reelGrid.test.ts.
import { REEL_WEIGHTS, type Weights } from "./reels";
import { COLD, HOT } from "./reelSets";

/** Наборов по каждую сторону от обычного. */
export const GRID_SIDE = 50;
/** Индекс обычного набора. */
export const GRID_MID = GRID_SIDE;
export const GRID_LAST = 2 * GRID_SIDE;

/** Отдача линий набора i (в ставках на линию), растёт с i. */
export const GRID_LINES: readonly number[] = [
  0.078616, 0.082235, 0.085898, 0.089608, 0.093364, 0.097167, 0.101018, 0.104918, 0.108867,
  0.112866, 0.116916, 0.121018, 0.125172, 0.129379, 0.13364, 0.137956, 0.142328, 0.146755, 0.15124,
  0.155783, 0.160385, 0.165046, 0.169768, 0.174551, 0.179397, 0.184306, 0.189279, 0.194316, 0.19942,
  0.20459, 0.209829, 0.215136, 0.220512, 0.225959, 0.231478, 0.237069, 0.242734, 0.248474, 0.254289,
  0.260181, 0.26615, 0.272199, 0.278327, 0.284536, 0.290826, 0.2972, 0.303659, 0.310202, 0.316832,
  0.323549, 0.330356, 0.342477, 0.354787, 0.36729, 0.379985, 0.392874, 0.405959, 0.419242, 0.432723,
  0.446405, 0.460289, 0.474377, 0.488669, 0.503169, 0.517877, 0.532795, 0.547924, 0.563267,
  0.578825, 0.594599, 0.610591, 0.626804, 0.643238, 0.659895, 0.676778, 0.693887, 0.711225,
  0.728793, 0.746593, 0.764627, 0.782897, 0.801404, 0.82015, 0.839137, 0.858368, 0.877843, 0.897564,
  0.917534, 0.937755, 0.958228, 0.978955, 0.999938, 1.021179, 1.042681, 1.064444, 1.086472,
  1.108765, 1.131326, 1.154158, 1.177261, 1.200639,
];

const cache = new Map<number, Weights[]>();

/** Веса барабанов набора i (0 — холодный, GRID_MID — обычный, GRID_LAST — горячий). */
export function gridWeights(index: number): Weights[] {
  const i = Math.max(0, Math.min(GRID_LAST, Math.round(index)));
  if (i === GRID_MID) return REEL_WEIGHTS;
  const hit = cache.get(i);
  if (hit) return hit;
  const far = i < GRID_MID ? COLD : HOT;
  const t = Math.abs(i - GRID_MID) / GRID_SIDE;
  const mixed = REEL_WEIGHTS.map((w, reel) => {
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    const bonus = w.bonus / total;
    const rest = total - w.bonus;
    const edge = far[reel];
    const farRest = Object.values(edge).reduce((a, b) => a + b, 0);
    const out: Weights = { ...w, bonus };
    for (const id of Object.keys(edge) as Array<keyof typeof edge>)
      out[id] = ((1 - t) * (w[id] / rest) + t * (edge[id] / farRest)) * (1 - bonus);
    return out;
  });
  cache.set(i, mixed);
  return mixed;
}

/** Набор, у которого отдача линий ближе всего к `lines` (за краями — крайний). */
export function gridIndexFor(lines: number): number {
  if (!(lines > GRID_LINES[0])) return 0;
  if (lines >= GRID_LINES[GRID_LAST]) return GRID_LAST;
  let i = 0;
  while (GRID_LINES[i + 1] < lines) i++;
  return lines - GRID_LINES[i] <= GRID_LINES[i + 1] - lines ? i : i + 1;
}
