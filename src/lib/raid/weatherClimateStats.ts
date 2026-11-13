// Доля времени и средняя длительность уровней в мире с климатом (админка «Смена погоды»):
// температура и уровень бросаются вместе (аномалия — всегда шторм), поэтому считается общая
// цепочка «температура × уровень» на тех же шансах, что бросок базы (nextTempOdds,
// nextLevelOdds), до устоявшейся доли. Без климата — прежние weatherLevelShare / Hours.
import {
  WEATHER_LEVELS,
  WEATHER_SLOT_MS,
  weatherAnomalyOf,
  type WeatherLevel,
} from "@/lib/raid/weather";
import {
  nextLevelOdds,
  nextTempOdds,
  weatherLevelHours,
  weatherLevelShare,
  type WeatherOdds,
} from "@/lib/raid/weatherOdds";
import {
  isDefaultClimate,
  weatherTempLadder,
  type WeatherClimate,
} from "@/lib/raid/weatherClimate";

export type ClimateStats = {
  /** Доля времени уровня, %. */
  share: Record<WeatherLevel, number>;
  /** Сколько в среднем держится уровень, часов (не уходит — Infinity, не бывает — 0). */
  hours: Record<WeatherLevel, number>;
  /** Доля времени в аномалии, %. */
  anomaly: number;
};

const SLOT_H = WEATHER_SLOT_MS / 3_600_000;
/** Ленивая цепочка возводится в степень 2^SQUARINGS — с запасом для любых шансов в целых %. */
const SQUARINGS = 40;

const mul = (a: number[][], b: number[][]): number[][] =>
  a.map((row) => b[0].map((_, j) => row.reduce((s, x, k) => s + x * b[k][j], 0)));

type State = { t: number; l: WeatherLevel };
type Edge = { to: number; p: number };

export function weatherClimateStats(o: WeatherOdds, c: WeatherClimate): ClimateStats {
  if (isDefaultClimate(c)) {
    const hours = Object.fromEntries(
      WEATHER_LEVELS.map((l) => [l, weatherLevelHours(l, o)]),
    ) as Record<WeatherLevel, number>;
    return { share: weatherLevelShare(o), hours, anomaly: 0 };
  }
  const states: State[] = weatherTempLadder(c).flatMap((t) =>
    WEATHER_LEVELS.map((l) => ({ t, l })),
  );
  const at = (s: State) => states.findIndex((x) => x.t === s.t && x.l === s.l);
  const edges: Edge[][] = states.map((s) => {
    const out: Edge[] = [];
    for (const tp of nextTempOdds(s.t, o, c))
      for (const lp of nextLevelOdds(s.l, o, c)) {
        const l = weatherAnomalyOf(tp.value) ? "storm" : lp.value;
        out.push({ to: at({ t: tp.value, l }), p: (tp.p / 100) * (lp.p / 100) });
      }
    return out;
  });
  // Ленивая цепочка (½ остаться) — та же устоявшаяся доля, без качелей между ступенями.
  let m: number[][] = states.map((_, i) => states.map((__, j) => (i === j ? 0.5 : 0)));
  edges.forEach((list, i) => list.forEach((e) => (m[i][e.to] += e.p / 2)));
  for (let r = 0; r < SQUARINGS; r++) m = mul(m, m);
  const start: number[] = states.map((s) =>
    c.levels.includes(s.l) && !weatherAnomalyOf(s.t) ? 1 : 0,
  );
  const sum0 = start.reduce((a, b) => a + b, 0);
  const pi = states.map((_, j) => start.reduce((acc, x, i) => acc + (x / sum0) * m[i][j], 0));
  const share = { clear: 0, overcast: 0, storm: 0 } as Record<WeatherLevel, number>;
  const leave = { clear: 0, overcast: 0, storm: 0 } as Record<WeatherLevel, number>;
  let anomaly = 0;
  states.forEach((s, i) => {
    share[s.l] += pi[i] * 100;
    if (weatherAnomalyOf(s.t)) anomaly += pi[i] * 100;
    for (const e of edges[i]) if (states[e.to].l !== s.l) leave[s.l] += pi[i] * e.p * 100;
  });
  const hours = Object.fromEntries(
    WEATHER_LEVELS.map((l) => [
      l,
      share[l] < 1e-9 ? 0 : leave[l] < 1e-9 ? Infinity : (SLOT_H * share[l]) / leave[l],
    ]),
  ) as Record<WeatherLevel, number>;
  return { share, hours, anomaly };
}
