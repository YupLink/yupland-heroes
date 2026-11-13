// Погода рейда (владелец, 26.10.2026): общая на карту (мир), новая каждые
// 3 часа — слоты по UTC 00, 03, …, 21. Температура −40…+40 °C, уровень — ясно /
// пасмурно / шторм, значок внутри уровня — «как в природе» от температуры: дождя
// в минус нет, метель только в минус. Острова новичка — без погоды. Смена плавная
// (28.10.2026): шансы следующего слота — lib/raid/weatherOdds.ts (weather-03).
//
// Пять коэффициентов (рыбалка — шанс, шахты и фермы — добыча, ход героя и ход
// корабля — стоимость). Итог (владелец, уточнение 26.10): «стандарт» (= 1) в
// среднем не участвует — температурный 1 → погодный, погодный 1 → температурный,
// иначе (температурный + погодный) / 2.
//
// Чистые функции. Те же таблицы и правила — в migrations/weather-01.sql
// (генератор raid_weather_ensure и raid_weather_coef): weather-01.test сверяет.
//
// Аномалия (владелец, 05.11.2026; климат мира — lib/raid/weatherClimate.ts): −50/−60 или
// +50/+60 — всегда шторм, значок — метель (холод) или огненный дождь (жара, только тут);
// коэффициенты не смешиваются: рыба не клюёт, шахты и фермы стоят, ход и ход на воде ×20
// (migrations/weather-08-climate.sql, raid_weather_coef_of).
//
// Снег (Кайлани через владельца, 09.11.2026: «обычный снег для „Холодно“ и „Очень холодно“,
// игра получает из API отдельный тип snow»): значок пасмурного уровня при −10 °C и ниже,
// как дождь — при плюсе. Коэффициенты — пасмурные (migrations/weather-09-snow.sql).

export const WEATHER_KINDS = [
  "clear",
  "overcast",
  "rain",
  "fog",
  "storm",
  "thunderstorm",
  "blizzard",
  "fire_rain",
  "snow",
] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

export const WEATHER_LEVELS = ["clear", "overcast", "storm"] as const;
export type WeatherLevel = (typeof WEATHER_LEVELS)[number];

export type WeatherCoefs = { fish: number; mine: number; farm: number; step: number; ship: number };
export type WeatherCoefKey = keyof WeatherCoefs;
/** Порядок столбцов в таблицах владельца и в SQL. */
export const WEATHER_COEF_KEYS: readonly WeatherCoefKey[] = [
  "fish",
  "mine",
  "farm",
  "step",
  "ship",
];

/** Погоды нет или влияние выключено — всё как было. */
export const NO_WEATHER: Readonly<WeatherCoefs> = Object.freeze({
  fish: 1,
  mine: 1,
  farm: 1,
  step: 1,
  ship: 1,
});

export const WEATHER_TEMP_MIN = -40;
export const WEATHER_TEMP_MAX = 40;
/** Наибольший шаг температуры между соседними слотами. */
export const WEATHER_TEMP_STEP = 20;
/**
 * Средняя длина слота: восемь смен в сутки (днём по 2 ч, ночью и утром по 4 ч) — те же
 * 3 ч в среднем. Только для оценок «сколько в среднем держится»; границы — weatherSlotStart.
 */
export const WEATHER_SLOT_MS = 3 * 60 * 60 * 1000;

export type WeatherBand = "very_cold" | "cold" | "cool" | "warm" | "hot";

const coefs = (fish: number, mine: number, farm: number, step: number, ship: number) => ({
  fish,
  mine,
  farm,
  step,
  ship,
});

/**
 * Категории температуры — верхняя граница включительно (для целых:
 * −40…−30 / −29…−10 / −9…+10 / +11…+30 / +31…+40).
 */
export const WEATHER_TEMP_BANDS: ReadonlyArray<{
  band: WeatherBand;
  upTo: number;
  coefs: WeatherCoefs;
}> = [
  { band: "very_cold", upTo: -30, coefs: coefs(0, 0.1, 0.1, 2, 10) },
  { band: "cold", upTo: -10, coefs: coefs(0.5, 0.4, 0.4, 1.5, 4) },
  { band: "cool", upTo: 10, coefs: coefs(1, 0.7, 0.7, 1, 2) },
  { band: "warm", upTo: 30, coefs: coefs(2, 1, 1, 1, 1) },
  { band: "hot", upTo: 40, coefs: coefs(4, 1, 2, 1, 1) },
];

export const WEATHER_LEVEL_COEFS: Readonly<Record<WeatherLevel, WeatherCoefs>> = {
  clear: coefs(1, 1, 2, 1, 1),
  overcast: coefs(4, 0.5, 0.5, 2, 2),
  storm: coefs(0, 0.01, 0.01, 5, 10),
};

/** Какие значки бывают у уровня вне аномалии (огненный дождь — только при жаре-аномалии). */
export const WEATHER_LEVEL_KINDS: Readonly<Record<WeatherLevel, readonly WeatherKind[]>> = {
  clear: ["clear"],
  overcast: ["overcast", "fog", "rain", "snow"],
  storm: ["storm", "thunderstorm", "blizzard"],
};

export const WEATHER_KIND_NAMES: Readonly<Record<WeatherKind, { ru: string; en: string }>> = {
  clear: { ru: "Ясно", en: "Clear" },
  overcast: { ru: "Пасмурно", en: "Overcast" },
  rain: { ru: "Дождь", en: "Rain" },
  fog: { ru: "Туман", en: "Fog" },
  storm: { ru: "Шторм", en: "Storm" },
  thunderstorm: { ru: "Гроза", en: "Thunderstorm" },
  blizzard: { ru: "Метель", en: "Blizzard" },
  fire_rain: { ru: "Огненный дождь", en: "Fire rain" },
  snow: { ru: "Снег", en: "Snow" },
};

/** Снег — при «Холодно» и «Очень холодно»: −10 °C и ниже. */
export const WEATHER_SNOW_MAX_C = -10;

export const WEATHER_ANOMALIES = ["cold", "heat"] as const;
export type WeatherAnomaly = (typeof WEATHER_ANOMALIES)[number];

/** Аномальные температуры: холод −60, −50 и жара +50, +60 (по возрастанию). */
export const WEATHER_ANOMALY_TEMPS: Readonly<Record<WeatherAnomaly, readonly number[]>> = {
  cold: [-60, -50],
  heat: [50, 60],
};

/** Значок аномалии: метель при холоде, огненный дождь при жаре (уровень — шторм). */
export const WEATHER_ANOMALY_KIND: Readonly<Record<WeatherAnomaly, WeatherKind>> = {
  cold: "blizzard",
  heat: "fire_rain",
};

/** При аномалии — вместо смеси: рыба 0, шахты 0, фермы 0, ход ×20, ход на воде ×20. */
export const WEATHER_ANOMALY_COEFS: Readonly<WeatherCoefs> = Object.freeze(coefs(0, 0, 0, 20, 20));

/** Аномалия при этой температуре: −50 и ниже — холод, +50 и выше — жара. */
export const weatherAnomalyOf = (tempC: number): WeatherAnomaly | null =>
  tempC <= -50 ? "cold" : tempC >= 50 ? "heat" : null;

export const isWeatherKind = (v: unknown): v is WeatherKind =>
  typeof v === "string" && (WEATHER_KINDS as readonly string[]).includes(v);

export const isWeatherLevel = (v: unknown): v is WeatherLevel =>
  typeof v === "string" && (WEATHER_LEVELS as readonly string[]).includes(v);

export function weatherLevelOf(kind: WeatherKind): WeatherLevel {
  if (kind === WEATHER_ANOMALY_KIND.heat) return "storm";
  for (const level of WEATHER_LEVELS) if (WEATHER_LEVEL_KINDS[level].includes(kind)) return level;
  return "clear";
}

/** Категория температуры; вне −40…+40 — крайняя. */
export function weatherBandOf(tempC: number): (typeof WEATHER_TEMP_BANDS)[number] {
  return (
    WEATHER_TEMP_BANDS.find((b) => tempC <= b.upTo) ??
    WEATHER_TEMP_BANDS[WEATHER_TEMP_BANDS.length - 1]
  );
}

/**
 * Один коэффициент из температурного t и погодного w: «стандарт» (1) в среднем
 * не участвует — t = 1 → w, w = 1 → t, иначе (t + w) / 2.
 */
export function weatherMix(t: number, w: number): number {
  if (t === 1) return w;
  if (w === 1) return t;
  return Math.round(((t + w) / 2) * 10_000) / 10_000;
}

/** Итог по каждому из пяти (weatherMix); при аномалии — WEATHER_ANOMALY_COEFS. */
export function weatherCoefs(tempC: number, kind: WeatherKind): WeatherCoefs {
  if (weatherAnomalyOf(tempC)) return { ...WEATHER_ANOMALY_COEFS };
  const t = weatherBandOf(tempC).coefs;
  const w = WEATHER_LEVEL_COEFS[weatherLevelOf(kind)];
  const mix = (k: WeatherCoefKey) => weatherMix(t[k], w[k]);
  return {
    fish: mix("fish"),
    mine: mix("mine"),
    farm: mix("farm"),
    step: mix("step"),
    ship: mix("ship"),
  };
}

// ── Генерация — зеркало raid_weather_ensure / raid_weather_kind_for (rnd ∈ [0, 1)).

/** Элемент списка по случайному числу: поровну, rnd = 1 не выходит за край. */
const pick = <T>(list: readonly T[], rnd: number): T =>
  list[Math.min(list.length - 1, Math.max(0, Math.floor(rnd * list.length)))];

/** Целое lo…hi поровну. */
const intIn = (lo: number, hi: number, rnd: number): number =>
  lo + Math.min(hi - lo, Math.max(0, Math.floor(rnd * (hi - lo + 1))));

/** Первый слот карты — любая точка сетки через 10 °C: −40, −30, …, +40 (weather-03). */
export const weatherFirstTemp = (rnd: number): number =>
  intIn(WEATHER_TEMP_MIN / 10, WEATHER_TEMP_MAX / 10, rnd) * 10;

/** Значки уровня при этой температуре (t < 0 — минус). */
export function weatherKindChoices(level: WeatherLevel, tempC: number): readonly WeatherKind[] {
  if (level === "clear") return ["clear"];
  if (level === "overcast") {
    if (tempC <= WEATHER_SNOW_MAX_C) return ["overcast", "fog", "snow"];
    return tempC < 0 ? ["overcast", "fog"] : ["overcast", "fog", "rain"];
  }
  return tempC < 0 ? ["blizzard"] : ["storm", "thunderstorm"];
}

export const weatherKindFor = (level: WeatherLevel, tempC: number, rnd: number): WeatherKind =>
  pick(weatherKindChoices(level, tempC), rnd);

// ── Слоты по Москве (владелец, 04.11.2026: «днём с 12:00 до 20:00 — раз в 2 часа, ночью
// с 20:00 до 08:00 — раз в 4 часа, время Мск»; утро 08–12 — тоже 4 ч). Зеркало SQL
// raid_weather_slot / raid_weather_slot_end (migrations/weather-07-schedule.sql).

const msOf = (at: Date | number): number => (typeof at === "number" ? at : at.getTime());
const HOUR = 3_600_000;
/** Москва — UTC+3 круглый год. */
const MSK = 3 * HOUR;
/** Начала слотов, часы по Москве. */
export const WEATHER_SLOT_HOURS = [0, 4, 8, 12, 14, 16, 18, 20] as const;

const mskDay = (ms: number): number => Math.floor((ms + MSK) / (24 * HOUR)) * 24 * HOUR - MSK;

export const weatherSlotStart = (at: Date | number): Date => {
  const ms = msOf(at);
  const day = mskDay(ms);
  const h = (ms - day) / HOUR;
  const start = [...WEATHER_SLOT_HOURS].reverse().find((x) => x <= h) ?? 0;
  return new Date(day + start * HOUR);
};

/** Начало следующего слота — когда сменится погода (днём через 2 ч, иначе через 4). */
export const weatherNextAt = (at: Date | number): Date => {
  const s = weatherSlotStart(at).getTime();
  const h = (s - mskDay(s)) / HOUR;
  return new Date(s + (h >= 12 && h <= 18 ? 2 : 4) * HOUR);
};
