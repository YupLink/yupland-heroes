// Плавная смена погоды (владелец, 28.10.2026): «если идёт N — с большей вероятностью
// N и будет, но есть вероятность другой погоды»; температура — «−10 / та же / +10».
//
//  · Уровень: ясно ↔ пасмурно ↔ шторм — только на соседний (из ясно в шторм сразу нельзя).
//    По умолчанию остаётся тот же — 50 %.
//  · Температура — на сетке через 10 °C: холоднее на 10 / та же / теплее на 10 =
//    30 / 40 / 30 %. На краю (−40, +40) шаг за край выбрасывается, остальные делят
//    его долю пропорционально. Шансы вниз и вверх — порознь (на будущее — шаманы).
//  · Уровень остался — значок прежний, если он возможен при новой температуре (дождь в
//    минус становится туманом/пасмурно, метель в плюс — штормом/грозой).
//
// Шансы — в процентах, правит админ (settings.weather_odds); здесь значения по
// умолчанию. Чистые функции — зеркало migrations/weather-03-odds.sql (тест сверяет):
// база бросает погоду, этот модуль считает прогноз и проверяет ввод админа.
// Климат мира (05.11.2026, weather-08): диапазон температуры и уровней, аномалии —
// последним аргументом; без него — как всегда (lib/raid/weatherClimate.ts).
import {
  WEATHER_ANOMALY_KIND,
  WEATHER_SLOT_MS,
  WEATHER_TEMP_MAX,
  WEATHER_TEMP_MIN,
  weatherAnomalyOf,
  weatherKindChoices,
  type WeatherKind,
  type WeatherLevel,
} from "@/lib/raid/weather";
import {
  WEATHER_CLIMATE_DEFAULT,
  climateSnapLevel,
  climateSnapTemp,
  climateTempBase,
  weatherTempLadder,
  type WeatherClimate,
} from "@/lib/raid/weatherClimate";

export type WeatherOdds = {
  /** Из ясно в пасмурно, %. Остальное — ясно. */
  clearToOvercast: number;
  /** Из пасмурно в ясно, %. */
  overcastToClear: number;
  /** Из пасмурно в шторм, %. Остальное — пасмурно. */
  overcastToStorm: number;
  /** Из шторма в пасмурно, %. Остальное — шторм. */
  stormToOvercast: number;
  /** Температура на 10 °C холоднее, %. */
  tempDown: number;
  /** На 10 °C теплее, %. Остальное — та же. */
  tempUp: number;
};

export const WEATHER_ODDS_KEYS = [
  "clearToOvercast",
  "overcastToClear",
  "overcastToStorm",
  "stormToOvercast",
  "tempDown",
  "tempUp",
] as const satisfies readonly (keyof WeatherOdds)[];

export const WEATHER_ODDS_DEFAULT: Readonly<WeatherOdds> = Object.freeze({
  clearToOvercast: 50,
  overcastToClear: 25,
  overcastToStorm: 25,
  stormToOvercast: 50,
  tempDown: 30,
  tempUp: 30,
});

/** Шаг температурной сетки, °C. */
export const WEATHER_TEMP_GRID = 10;

/** Что не так в шансах админа; null — всё верно. */
export function weatherOddsError(o: WeatherOdds): string | null {
  for (const k of WEATHER_ODDS_KEYS) {
    const v = o[k];
    if (!Number.isInteger(v) || v < 0 || v > 100) return "Шансы — целые проценты от 0 до 100";
  }
  if (o.overcastToClear + o.overcastToStorm > 100)
    return "Из пасмурно: в ясно и в шторм вместе — не больше 100 %";
  if (o.tempDown + o.tempUp > 100) return "Температура: холоднее и теплее вместе — не больше 100 %";
  return null;
}

/** Шансы из настройки: чего нет или что битое — по умолчанию. */
export function weatherOddsOf(raw: unknown): WeatherOdds {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const o = { ...WEATHER_ODDS_DEFAULT };
  for (const k of WEATHER_ODDS_KEYS) if (typeof src[k] === "number") o[k] = src[k];
  return weatherOddsError(o) ? { ...WEATHER_ODDS_DEFAULT } : o;
}

export type Chance<T> = { value: T; p: number };

/**
 * Уровень на следующую смену: шансы в %, порядок — как у броска базы. Климат: уровни не из
 * мира выброшены (остальные делят долю), сейчас чужой — ближайший мира (raid_weather_level_dist_in).
 */
export function nextLevelOdds(
  prev: WeatherLevel,
  o: WeatherOdds,
  c: WeatherClimate = WEATHER_CLIMATE_DEFAULT,
): Chance<WeatherLevel>[] {
  const all = levelOddsAll(prev, o);
  if (!c.levels.includes(prev)) return [{ value: climateSnapLevel(prev, c), p: 100 }];
  const kept = all.filter((x) => c.levels.includes(x.value));
  if (kept.length === all.length) return all;
  const sum = kept.reduce((s, x) => s + x.p, 0);
  if (sum <= 0) return [{ value: prev, p: 100 }];
  return kept.map((x) => ({ value: x.value, p: (x.p / sum) * 100 }));
}

function levelOddsAll(prev: WeatherLevel, o: WeatherOdds): Chance<WeatherLevel>[] {
  if (prev === "clear")
    return [
      { value: "overcast", p: o.clearToOvercast },
      { value: "clear", p: 100 - o.clearToOvercast },
    ];
  if (prev === "storm")
    return [
      { value: "overcast", p: o.stormToOvercast },
      { value: "storm", p: 100 - o.stormToOvercast },
    ];
  return [
    { value: "clear", p: o.overcastToClear },
    { value: "storm", p: o.overcastToStorm },
    { value: "overcast", p: 100 - o.overcastToClear - o.overcastToStorm },
  ];
}

/** Ближайшая точка сетки (половина — вверх, как floor((t + 5) / 10) в базе). */
export const weatherTempBase = (t: number): number =>
  Math.min(
    WEATHER_TEMP_MAX,
    Math.max(
      WEATHER_TEMP_MIN,
      Math.floor((t + WEATHER_TEMP_GRID / 2) / WEATHER_TEMP_GRID) * WEATHER_TEMP_GRID,
    ),
  );

/**
 * Температура на следующую смену: шансы в % — соседние ступени лестницы мира (без климата
 * −40…+40); за краем — поделены между остальными. Не на лестнице — ближайшая точка диапазона.
 */
export function nextTempOdds(
  prev: number,
  o: WeatherOdds,
  c: WeatherClimate = WEATHER_CLIMATE_DEFAULT,
): Chance<number>[] {
  const ladder = weatherTempLadder(c);
  const base = climateTempBase(prev);
  const i = ladder.indexOf(base);
  if (i < 0) return [{ value: climateSnapTemp(prev, c), p: 100 }];
  const all = [
    { value: ladder[i - 1], w: o.tempDown },
    { value: base, w: 100 - o.tempDown - o.tempUp },
    { value: ladder[i + 1], w: o.tempUp },
  ].filter((x): x is { value: number; w: number } => x.value !== undefined);
  const sum = all.reduce((s, x) => s + x.w, 0);
  if (sum <= 0) return [{ value: base, p: 100 }];
  return all.map((x) => ({ value: x.value, p: (x.w / sum) * 100 }));
}

/** Бросок по шансам: rnd ∈ [0, 1), исходы с нулевым шансом не выпадают. */
export function pickChance<T>(list: readonly Chance<T>[], rnd: number): T {
  const sum = list.reduce((s, x) => s + x.p, 0);
  let acc = 0;
  for (const x of list) {
    acc += x.p;
    if (x.p > 0 && rnd * sum < acc) return x.value;
  }
  return [...list].reverse().find((x) => x.p > 0)?.value ?? list[list.length - 1].value;
}

/**
 * Значок нового слота: аномалия — метель / огненный дождь; уровень тот же и прежний значок
 * возможен — он; иначе поровну из возможных.
 */
export function nextWeatherKind(
  prev: { level: WeatherLevel; kind: WeatherKind } | null,
  level: WeatherLevel,
  tempC: number,
  rnd: number,
): WeatherKind {
  const anomaly = weatherAnomalyOf(tempC);
  if (anomaly) return WEATHER_ANOMALY_KIND[anomaly];
  const choices = weatherKindChoices(level, tempC);
  if (prev && prev.level === level && choices.includes(prev.kind)) return prev.kind;
  return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(rnd * choices.length)))];
}

/** Доля времени каждого уровня при этих шансах, % (устоявшаяся, на долгом отрезке). */
export function weatherLevelShare(o: WeatherOdds): Record<WeatherLevel, number> {
  // Цепочка «ясно — пасмурно — шторм»: поток туда равен потоку обратно.
  const clear =
    o.clearToOvercast > 0
      ? o.overcastToClear / o.clearToOvercast
      : o.overcastToClear > 0
        ? Infinity
        : 0;
  const storm =
    o.stormToOvercast > 0
      ? o.overcastToStorm / o.stormToOvercast
      : o.overcastToStorm > 0
        ? Infinity
        : 0;
  if (!Number.isFinite(clear) || !Number.isFinite(storm)) {
    const both = !Number.isFinite(clear) && !Number.isFinite(storm);
    return {
      clear: Number.isFinite(clear) ? 0 : both ? 50 : 100,
      overcast: 0,
      storm: Number.isFinite(storm) ? 0 : both ? 50 : 100,
    };
  }
  const total = 1 + clear + storm;
  return {
    clear: (clear / total) * 100,
    overcast: (1 / total) * 100,
    storm: (storm / total) * 100,
  };
}

/** Сколько в среднем держится уровень, часов; не уходит никогда — Infinity. */
export function weatherLevelHours(level: WeatherLevel, o: WeatherOdds): number {
  const stay = nextLevelOdds(level, o).find((x) => x.value === level)?.p ?? 0;
  return stay >= 100 ? Infinity : WEATHER_SLOT_MS / 3_600_000 / (1 - stay / 100);
}
