// Варианты точки возрождения моба — общие для окна админа и сервера.
// Выбор только из списков (правило владельца): никаких ручных чисел.

/** Через сколько минут встаёт убитый. */
export const RESPAWN_MIN = [5, 15, 30, 60, 180, 360, 1440] as const;
/** На сколько клеток бродит от родной (0 — стоит). */
export const ROAM_CELLS = [0, 3, 5, 10] as const;
/** Раз во сколько минут шагает. */
export const STEP_MIN = [1, 5, 15, 30, 60] as const;

export const MOB_SPAWN_DEFAULT = { respawnMin: 30, roam: 5, stepMin: 5 } as const;

/**
 * Погода точки (владелец 31.10.2026: «спавн по погоде — да»): вид погоды мира или
 * мороз / жара. Пришла — моб встаёт, ушла — не раненый уходит с карты. null — любая.
 */
export const SPAWN_WEATHER = [
  "clear",
  "overcast",
  "rain",
  "fog",
  "storm",
  "thunderstorm",
  "blizzard",
  "frost",
  "heat",
  "snow",
] as const;
export type SpawnWeather = (typeof SPAWN_WEATHER)[number];
/** Мороз — от −10 °C и ниже, жара — от +30 °C (сетка температуры — через 10°). */
export const SPAWN_FROST_C = -10;
export const SPAWN_HEAT_C = 30;

const WEATHER_NAMES: Record<SpawnWeather, [string, string]> = {
  clear: ["ясно", "clear"],
  overcast: ["пасмурно", "overcast"],
  rain: ["дождь", "rain"],
  fog: ["туман", "fog"],
  storm: ["шторм", "storm"],
  thunderstorm: ["гроза", "thunderstorm"],
  blizzard: ["метель", "blizzard"],
  frost: ["мороз (−10° и ниже)", "frost (−10° and below)"],
  heat: ["жара (+30° и выше)", "heat (+30° and above)"],
  snow: ["снег", "snow"],
};

export const spawnWeatherName = (w: SpawnWeather, en: boolean): string =>
  WEATHER_NAMES[w][en ? 1 : 0];

export const isSpawnWeather = (v: unknown): v is SpawnWeather =>
  typeof v === "string" && (SPAWN_WEATHER as readonly string[]).includes(v);

/**
 * Погода списком (04.11.2026: «выбирать несколько»): из базы (массив или одна
 * старая), без мусора и повторов, в порядке SPAWN_WEATHER. Пусто — любая.
 */
export function spawnWeathers(raw: unknown, legacy?: unknown): SpawnWeather[] {
  const list = Array.isArray(raw) ? raw : legacy != null ? [legacy] : [];
  return SPAWN_WEATHER.filter((w) => list.includes(w));
}

/** «дождь, туман» / «любая погода». */
export const spawnWeathersText = (list: readonly SpawnWeather[], en: boolean): string =>
  list.length
    ? list.map((w) => spawnWeatherName(w, en)).join(", ")
    : en
      ? "any weather"
      : "любая погода";

export type MobSpawnView = {
  id: string;
  respawnMin: number;
  roam: number;
  stepMin: number;
  home: { q: number; r: number };
  /** Моб жив; иначе — через сколько минут встанет (0 — ждёт свободную клетку). */
  alive: boolean;
  dueInMin: number | null;
  /** Погода точки — любая из отмеченных; пусто — любая. */
  weathers: SpawnWeather[];
  /** Запись завела точка спавна — её клетка (настраивать там). */
  point: { q: number; r: number } | null;
  /** Сейчас в мире погода точки (или погода любая). */
  weatherNow: boolean;
};

/** «5 мин», «1 ч», «24 ч». */
export function minutesText(min: number, en: boolean): string {
  if (min >= 60 && min % 60 === 0) return `${min / 60} ${en ? "h" : "ч"}`;
  return `${min} ${en ? "min" : "мин"}`;
}
