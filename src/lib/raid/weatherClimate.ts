// Климат мира (владелец, 05.11.2026): «в некоторых мирах … шансы на более вероятную погоду
// и минимум и максимум по погоде и по температурам … галка аномальных погод — и выбор жара
// или холод». settings.weather_climate_world {mapId: климат}; мира нет — как всегда:
// −40…+40, все три уровня, без аномалий (броски те же до цифры).
//
//  · Температура ходит по «лестнице» точек сетки: tempMin…tempMax через 10 °C, с аномалией
//    холода снизу ещё −60, −50, жары сверху +50, +60. Шаг — на соседнюю ступень (шансы
//    tempDown / та же / tempUp); за край лестницы шаг выбрасывается, остальные делят долю.
//    Сейчас не на лестнице (диапазон сузили, аномалию сняли) — следующая смена ставит
//    ближайшую точку диапазона.
//  · Уровень — только из отмеченных подряд (ясно / пасмурно / шторм); переход в чужой
//    выбрасывается; сейчас чужой — ближайший отмеченный.
//  · Аномалия (≤ −50 / ≥ +50) — шторм; значок и коэффициенты — lib/raid/weather.ts.
//
// Чистые функции — зеркало migrations/weather-08-climate.sql (raid_weather_climate,
// raid_weather_temp_ladder, raid_weather_temp_step, raid_weather_first_*).
import {
  WEATHER_ANOMALIES,
  WEATHER_ANOMALY_TEMPS,
  WEATHER_LEVELS,
  WEATHER_TEMP_MAX,
  WEATHER_TEMP_MIN,
  isWeatherLevel,
  type WeatherAnomaly,
  type WeatherLevel,
} from "@/lib/raid/weather";

export type WeatherClimate = {
  /** Нижняя граница, °C: −40…+40 через 10. */
  tempMin: number;
  /** Верхняя граница, °C: −40…+40 через 10, не ниже tempMin. */
  tempMax: number;
  /** Уровни подряд в порядке ясно → шторм. */
  levels: readonly WeatherLevel[];
  /** Аномалии мира: холод (−50/−60), жара (+50/+60) или нет. */
  anomaly: WeatherAnomaly | null;
};

/** Точки сетки, которые можно выбрать границей: −40, −30, …, +40. */
export const WEATHER_CLIMATE_TEMPS: readonly number[] = Array.from(
  { length: (WEATHER_TEMP_MAX - WEATHER_TEMP_MIN) / 10 + 1 },
  (_, i) => WEATHER_TEMP_MIN + i * 10,
);

export const WEATHER_CLIMATE_DEFAULT: Readonly<WeatherClimate> = Object.freeze({
  tempMin: WEATHER_TEMP_MIN,
  tempMax: WEATHER_TEMP_MAX,
  levels: WEATHER_LEVELS,
  anomaly: null,
});

const levelIndex = (l: WeatherLevel): number => WEATHER_LEVELS.indexOf(l);

/** Что не так в климате; null — всё верно. */
export function weatherClimateError(c: WeatherClimate): string | null {
  if (!WEATHER_CLIMATE_TEMPS.includes(c.tempMin) || !WEATHER_CLIMATE_TEMPS.includes(c.tempMax))
    return "Температура — от −40 до +40 через 10°";
  if (c.tempMin > c.tempMax) return "Температура: минимум не выше максимума";
  const ix = c.levels.map((l) => (isWeatherLevel(l) ? levelIndex(l) : -1));
  if (!ix.length || ix.some((i, n) => i < 0 || (n > 0 && i !== ix[n - 1] + 1)))
    return "Погода — подряд из ясно, пасмурно, шторм";
  if (c.anomaly !== null && !(WEATHER_ANOMALIES as readonly unknown[]).includes(c.anomaly))
    return "Аномалия — холод или жара";
  return null;
}

/** Климат из настройки мира: чего нет — как всегда; битое — весь климат как всегда. */
export function weatherClimateOf(raw: unknown): WeatherClimate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return WEATHER_CLIMATE_DEFAULT;
  const src = raw as Record<string, unknown>;
  const c: WeatherClimate = { ...WEATHER_CLIMATE_DEFAULT };
  if (typeof src.tempMin === "number") c.tempMin = src.tempMin;
  if (typeof src.tempMax === "number") c.tempMax = src.tempMax;
  if ("anomaly" in src) c.anomaly = src.anomaly as WeatherAnomaly | null;
  if (Array.isArray(src.levels)) {
    const list: unknown[] = src.levels;
    if (!list.every(isWeatherLevel)) return WEATHER_CLIMATE_DEFAULT;
    c.levels = WEATHER_LEVELS.filter((l) => list.includes(l));
  }
  return weatherClimateError(c) ? WEATHER_CLIMATE_DEFAULT : c;
}

/** Климат как всегда (такой мир в настройке не хранится). */
export const isDefaultClimate = (c: WeatherClimate): boolean =>
  c.tempMin === WEATHER_TEMP_MIN &&
  c.tempMax === WEATHER_TEMP_MAX &&
  c.levels.length === WEATHER_LEVELS.length &&
  c.anomaly === null;

/** Ступени температуры мира по возрастанию (с аномалией — и её точки). */
export function weatherTempLadder(c: WeatherClimate): number[] {
  const out: number[] = c.anomaly === "cold" ? [...WEATHER_ANOMALY_TEMPS.cold] : [];
  for (let t = c.tempMin; t <= c.tempMax; t += 10) out.push(t);
  if (c.anomaly === "heat") out.push(...WEATHER_ANOMALY_TEMPS.heat);
  return out;
}

/** Точка сетки температуры (половина — вверх), без обрезки краями. */
export const climateTempBase = (t: number): number => Math.floor((t + 5) / 10) * 10;

/** Соседняя ступень (dir +1 — теплее, −1 — холоднее); нет её или не на лестнице — null. */
export function weatherTempStep(prev: number, c: WeatherClimate, dir: 1 | -1): number | null {
  const ladder = weatherTempLadder(c);
  const i = ladder.indexOf(climateTempBase(prev));
  return i < 0 ? null : (ladder[i + dir] ?? null);
}

/** Ближайшая точка диапазона мира (для температуры не на лестнице). */
export const climateSnapTemp = (t: number, c: WeatherClimate): number =>
  Math.min(c.tempMax, Math.max(c.tempMin, climateTempBase(t)));

/** Ближайший отмеченный уровень. */
export function climateSnapLevel(level: WeatherLevel, c: WeatherClimate): WeatherLevel {
  if (c.levels.includes(level)) return level;
  return levelIndex(level) < levelIndex(c.levels[0]) ? c.levels[0] : c.levels[c.levels.length - 1];
}

/** Первый слот мира: точка диапазона поровну (rnd ∈ [0, 1)) — raid_weather_first_temp. */
export function weatherFirstTempIn(c: WeatherClimate, rnd: number): number {
  const n = (c.tempMax - c.tempMin) / 10 + 1;
  return c.tempMin + 10 * Math.min(n - 1, Math.max(0, Math.floor(rnd * n)));
}

/** Первый слот мира: отмеченный уровень поровну — raid_weather_first_level. */
export function weatherFirstLevelIn(c: WeatherClimate, rnd: number): WeatherLevel {
  const n = c.levels.length;
  return c.levels[Math.min(n - 1, Math.max(0, Math.floor(rnd * n)))];
}
