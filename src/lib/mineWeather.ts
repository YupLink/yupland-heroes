// Погода у шахт v2 (владелец, 26.10.2026; migrations/weather-02-effects.sql): каждый
// полный час добычи — × коэффициент «шахты» того слота погоды, где этот час начался.
// Доли не теряются: готово = (часы + Σ(коэф − 1)) × ставка, до 0,0001 — тот же счёт,
// что у SQL raid_mine_weather_delta в raid_mine_v2_settle / raid_mine_pending.
//
// Сервер отдаёт слоты несобранной части отрезка (raid_mine_weather_slots: [начало
// слота, мс; коэффициент]) только если хоть один ≠ 1. Нет слотов — погода не влияет
// (влияние выключено, остров, нет погоды), и счёт ровно прежний. Час, начавшийся
// позже последнего известного слота (погода следующего ещё не выпала), считается по
// последнему — до ближайшего перезапроса списка; судья — сервер.

/** Слот погоды: начало, мс (UTC), и коэффициент «шахты». */
export type MineWeatherSlot = readonly [at: number, coef: number];
export type MineWeather = readonly MineWeatherSlot[];

const HOUR_MS = 3_600_000;

/** Слоты из ответа базы (jsonb [[мс, коэф], …] или его текст); мусор, пусто, все 1 — null. */
export function mineWeatherOf(raw: unknown): MineWeather | null {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(v)) return null;
  const out: MineWeatherSlot[] = [];
  for (const x of v) {
    const [at, coef] = Array.isArray(x) ? [Number(x[0]), Number(x[1])] : [NaN, NaN];
    if (Number.isFinite(at) && Number.isFinite(coef) && coef >= 0) out.push([at, coef]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out.some(([, c]) => c !== 1) ? out : null;
}

/** Коэффициент часа, начавшегося в t: слот, где он начался; позже известных — последний. */
export function mineCoefAt(w: MineWeather, t: number): number {
  let coef = 1;
  for (const [at, c] of w) {
    if (at > t) break;
    coef = c;
  }
  return coef;
}

/**
 * Σ(коэф − 1) по часам fromMs + h0 … fromMs + h0 + n − 1 (как SQL
 * raid_mine_weather_delta): прибавка к числу часов. Нет погоды — ровно 0.
 */
export function mineWeatherDelta(
  w: MineWeather | null | undefined,
  fromMs: number,
  h0: number,
  n: number,
): number {
  if (!w || w.length === 0 || !(n > 0)) return 0;
  let delta = 0;
  for (let i = 0; i < n; i++) {
    const c = mineCoefAt(w, fromMs + (h0 + i) * HOUR_MS);
    if (c !== 1) delta += c - 1;
  }
  return delta;
}
