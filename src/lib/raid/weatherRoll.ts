// Бросок погоды слота — зеркало raid_weather_ensure (migrations/weather-08-climate.sql) для
// тестов и прогноза: тот же порядок случайных чисел (температура, уровень, значок), те же
// распределения. Аномалия (≤ −50 / ≥ +50) — уровень всегда шторм, значок — метель /
// огненный дождь (nextWeatherKind). База бросает сама; код погоду не пишет.
import {
  weatherAnomalyOf,
  weatherKindFor,
  type WeatherKind,
  type WeatherLevel,
} from "@/lib/raid/weather";
import {
  WEATHER_CLIMATE_DEFAULT,
  weatherFirstLevelIn,
  weatherFirstTempIn,
  type WeatherClimate,
} from "@/lib/raid/weatherClimate";
import {
  nextLevelOdds,
  nextTempOdds,
  nextWeatherKind,
  pickChance,
  type WeatherOdds,
} from "@/lib/raid/weatherOdds";
import { applyVotes, levelVotes, tempVotes, type RitualVotes } from "@/lib/raid/weatherRitual";

export type WeatherSlot = { temperatureC: number; level: WeatherLevel; kind: WeatherKind };

/** Три случайных числа броска, rnd ∈ [0, 1): температура, уровень, значок. */
export type WeatherRnd = readonly [temp: number, level: number, kind: number];

/** Первый слот мира: точка диапазона и отмеченный уровень поровну. */
export function rollFirstWeather(
  c: WeatherClimate = WEATHER_CLIMATE_DEFAULT,
  [rt, rl, rk]: WeatherRnd,
): WeatherSlot {
  const temperatureC = weatherFirstTempIn(c, rt);
  const level = weatherFirstLevelIn(c, rl);
  return { temperatureC, level, kind: weatherKindFor(level, temperatureC, rk) };
}

/** Следующий слот после prev: шансы мира, его климат и голоса шаманов прошлого слота. */
export function rollNextWeather(
  prev: WeatherSlot,
  odds: WeatherOdds,
  c: WeatherClimate = WEATHER_CLIMATE_DEFAULT,
  votes: RitualVotes = {},
  [rt, rl, rk]: WeatherRnd,
): WeatherSlot {
  const temperatureC = pickChance(
    applyVotes(nextTempOdds(prev.temperatureC, odds, c), tempVotes(prev.temperatureC, votes, c)),
    rt,
  );
  const rolled = pickChance(applyVotes(nextLevelOdds(prev.level, odds, c), levelVotes(votes)), rl);
  const level: WeatherLevel = weatherAnomalyOf(temperatureC) ? "storm" : rolled;
  return { temperatureC, level, kind: nextWeatherKind(prev, level, temperatureC, rk) };
}
