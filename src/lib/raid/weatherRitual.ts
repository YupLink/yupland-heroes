// Обряд шамана в метеостанции (владелец, 28.10.2026): шаман тратится и даёт +3 % тому,
// что выбрал игрок, — погоде (из тех, что могут выпасть) или температуре (теплее /
// холоднее) — на ближайшую смену погоды этого мира. Голос за другое забирает обратно:
// каждый голос берёт свои 3 % у остальных исходов пропорционально их долям. Выше 90 %
// голоса ни один исход не поднимают (если шансы админа и так выше — не опускают).
// С аккаунта — один обряд за смену (во всех мирах).
//
// Чистые функции — зеркало migrations/weather-04-ritual.sql (raid_weather_apply_votes).
// Климат мира (05.11.2026, weather-08): голосовать можно только за возможное в этом мире —
// уровни мира и ступени его лестницы (аномалия — только с галкой; raid_weather_ritual).
import { weatherAnomalyOf, type WeatherLevel } from "@/lib/raid/weather";
import { nextLevelOdds, nextTempOdds, type Chance, type WeatherOdds } from "@/lib/raid/weatherOdds";
import {
  WEATHER_CLIMATE_DEFAULT,
  weatherTempStep,
  type WeatherClimate,
} from "@/lib/raid/weatherClimate";

/** Сколько процентов даёт один шаман. */
export const RITUAL_PCT = 3;
/** Выше этого ни один исход не поднимается. */
export const RITUAL_CAP = 90;

export const RITUAL_TARGETS = ["clear", "overcast", "storm", "warmer", "colder"] as const;
export type RitualTarget = (typeof RITUAL_TARGETS)[number];
export type RitualVotes = Partial<Record<RitualTarget, number>>;

export const isRitualTarget = (v: unknown): v is RitualTarget =>
  typeof v === "string" && (RITUAL_TARGETS as readonly string[]).includes(v);

/**
 * Шансы с голосами (в %). Ключ голоса — String(значение исхода); голоса за исход,
 * которого нет в списке, не считаются. Без голосов — список как есть.
 */
export function applyVotes<T>(
  dist: readonly Chance<T>[],
  votes: ReadonlyMap<string, number>,
): Chance<T>[] {
  const v = dist.map((c) => Math.max(0, votes.get(String(c.value)) ?? 0));
  if (v.every((n) => n === 0)) return dist.map((c) => ({ ...c }));
  const sum = dist.reduce((s, c) => s + c.p, 0);
  const base = dist.map((c) => (sum > 0 ? (c.p / sum) * 100 : 100 / dist.length));
  let q = base.map((p, i) => {
    let d = RITUAL_PCT * v[i];
    for (let x = 0; x < base.length; x++)
      if (x !== i && v[x] > 0 && base[x] < 100) d -= (RITUAL_PCT * v[x] * p) / (100 - base[x]);
    return Math.min(100, Math.max(0, p + d));
  });
  const total = q.reduce((s, p) => s + p, 0);
  q = total > 0 ? q.map((p) => (p / total) * 100) : base;
  // Потолок — 90 %, но голоса не опускают исход, у которого и без них больше (шансы админа).
  const capOf = (i: number) => Math.max(RITUAL_CAP, base[i]);
  const top = q.findIndex((p, i) => p > capOf(i));
  if (top >= 0) {
    const cap = capOf(top);
    const extra = q[top] - cap;
    const others = q.reduce((s, p, i) => (i === top ? s : s + p), 0);
    const baseOthers = base.reduce((s, p, i) => (i === top ? s : s + p), 0);
    const n = q.length - 1;
    q = q.map((p, i) => {
      if (i === top) return cap;
      if (others > 0) return p + (extra * p) / others;
      if (baseOthers > 0) return p + (extra * base[i]) / baseOthers;
      return p + extra / n;
    });
  }
  return dist.map((c, i) => ({ value: c.value, p: q[i] }));
}

/** Голоса уровня: ключи — уровни. */
export function levelVotes(votes: RitualVotes): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of ["clear", "overcast", "storm"] as const) if (votes[k]) m.set(k, votes[k] ?? 0);
  return m;
}

/**
 * Голоса температуры: «теплее» — соседняя ступень выше (без климата +10 от точки сетки),
 * «холоднее» — ниже; ступени нет — голос не считается (raid_weather_temp_votes_in).
 */
export function tempVotes(
  prevTemp: number,
  votes: RitualVotes,
  c: WeatherClimate = WEATHER_CLIMATE_DEFAULT,
): Map<string, number> {
  const m = new Map<string, number>();
  const up = weatherTempStep(prevTemp, c, 1);
  const down = weatherTempStep(prevTemp, c, -1);
  if (votes.warmer && up !== null) m.set(String(up), votes.warmer);
  if (votes.colder && down !== null) m.set(String(down), votes.colder);
  return m;
}

/**
 * Уровень на следующую смену с учётом аномалии: температура уйдёт в аномалию — будет шторм
 * при любом броске уровня. Шанс аномалии из температур; нет его — уровни как есть.
 */
export function withAnomalyLevels(
  levels: readonly Chance<WeatherLevel>[],
  temps: readonly Chance<number>[],
): Chance<WeatherLevel>[] {
  const total = temps.reduce((s, x) => s + x.p, 0);
  const odd = temps.reduce((s, x) => (weatherAnomalyOf(x.value) ? s + x.p : s), 0);
  if (!(odd > 0) || !(total > 0)) return levels.map((c) => ({ ...c }));
  const share = odd / total;
  const sum = levels.reduce((s, x) => s + x.p, 0);
  const out = levels.map((c) => ({
    value: c.value,
    p: (sum > 0 ? (c.p / sum) * 100 : 0) * (1 - share) + (c.value === "storm" ? share * 100 : 0),
  }));
  if (!out.some((c) => c.value === "storm")) out.push({ value: "storm", p: share * 100 });
  return out;
}

/** Шансы следующей смены с голосами шаманов (климат мира — последним). */
export function forecastWithVotes(
  now: { level: WeatherLevel; temperatureC: number },
  odds: WeatherOdds,
  votes: RitualVotes,
  c: WeatherClimate = WEATHER_CLIMATE_DEFAULT,
): { levels: Chance<WeatherLevel>[]; temps: Chance<number>[] } {
  const temps = applyVotes(
    nextTempOdds(now.temperatureC, odds, c),
    tempVotes(now.temperatureC, votes, c),
  );
  const levels = applyVotes(nextLevelOdds(now.level, odds, c), levelVotes(votes));
  return { levels: withAnomalyLevels(levels, temps), temps };
}

/** Какие уровни могут выпасть следующими: тот же и соседние (ясно ↔ пасмурно ↔ шторм). */
const NEXT_LEVELS: Readonly<Record<WeatherLevel, readonly WeatherLevel[]>> = {
  clear: ["clear", "overcast"],
  overcast: ["clear", "overcast", "storm"],
  storm: ["overcast", "storm"],
};

/**
 * За что можно голосовать сейчас: уровни мира, которые могут выпасть (сейчас уровень не из
 * мира — ни один), и шаг температуры, если на лестнице мира есть соседняя ступень.
 */
export function ritualTargets(
  now: { level: WeatherLevel; temperatureC: number },
  c: WeatherClimate = WEATHER_CLIMATE_DEFAULT,
): RitualTarget[] {
  const out: RitualTarget[] = c.levels.includes(now.level)
    ? NEXT_LEVELS[now.level].filter((l) => c.levels.includes(l))
    : [];
  if (weatherTempStep(now.temperatureC, c, 1) !== null) out.push("warmer");
  if (weatherTempStep(now.temperatureC, c, -1) !== null) out.push("colder");
  return out;
}
