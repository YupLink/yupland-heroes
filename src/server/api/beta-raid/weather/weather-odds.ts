// Шансы смены погоды на сервере (владелец, 28.10.2026; migrations/weather-03-odds).
//
// readWeatherOdds — те же шансы, по которым база бросает следующий слот: функция базы
// raid_weather_odds() (значения по умолчанию + settings.weather_odds), у мира —
// raid_weather_odds(mapId) (свои числа мира поверх, settings.weather_odds_world, 31.10.2026).
// Кэш процесса на минуту на мир; сбой базы — значения по умолчанию, в кэш не кладём.
//
// weatherForecastOf — погода карты сейчас и шансы на следующую смену: для метеостанции.
// Шансы — с климатом мира (диапазоны, аномалия; weather-climate.ts, 05.11.2026).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import {
  WEATHER_ODDS_DEFAULT,
  nextLevelOdds,
  nextTempOdds,
  weatherOddsOf,
  type Chance,
  type WeatherOdds,
} from "@/lib/raid/weatherOdds";
import type { WeatherLevel } from "@/lib/raid/weather";
import type { WeatherClimate } from "@/lib/raid/weatherClimate";
import { raidWeatherOf, type RaidWeather } from "@/server/api/beta-raid/weather/weather-get";
import { readWeatherClimate } from "@/server/api/beta-raid/weather/weather-climate";

const TTL_MS = 60_000;
/** Ключ "" — общие шансы, иначе id мира. */
const cached = new Map<string, { odds: WeatherOdds; until: number }>();

/** Шансы из базы без подмены: сбой — ошибка (админке нельзя показать «по умолчанию» как сохранённые). */
export async function readWeatherOddsStrict(
  now = Date.now(),
  mapId: string | null = null,
): Promise<WeatherOdds> {
  const call = mapId
    ? `yuplink.raid_weather_odds(${sqlStr(mapId)})`
    : "yuplink.raid_weather_odds()";
  const rows = (await mcpExec(`SELECT ${call} AS odds`, {
    wrapJson: true,
  })) as Array<{ odds: unknown }> | null;
  const raw = rows?.[0]?.odds;
  if (!raw || typeof raw !== "object") throw new Error("Не удалось прочитать шансы погоды");
  const odds = weatherOddsOf(raw);
  cached.set(mapId ?? "", { odds, until: now + TTL_MS });
  return odds;
}

/** Шансы мира (свои поверх общих); без мира — общие. */
export async function readWeatherOdds(
  now = Date.now(),
  mapId: string | null = null,
): Promise<WeatherOdds> {
  const hit = cached.get(mapId ?? "");
  if (hit && now < hit.until) return hit.odds;
  try {
    return await readWeatherOddsStrict(now, mapId);
  } catch (e) {
    console.warn("[weather] шансы:", e instanceof Error ? e.message : e);
    return { ...WEATHER_ODDS_DEFAULT };
  }
}

/** Админ сохранил шансы — этот процесс перечитает сразу, остальные — в пределах минуты. */
export const forgetWeatherOdds = (): void => {
  cached.clear();
};

export type WeatherForecast = {
  now: RaidWeather;
  /** Уровень после следующей смены (now.nextAt), %. */
  levels: Chance<WeatherLevel>[];
  /** Температура после следующей смены, %. */
  temps: Chance<number>[];
  /** Климат мира (голоса и цели обряда — по нему); нет — как всегда. */
  climate?: WeatherClimate;
};

/** Погода карты и шансы на следующую смену (шансы этого мира); погоды нет — null. */
export async function weatherForecastOf(
  mapId: string,
  at = Date.now(),
  known?: WeatherOdds,
): Promise<WeatherForecast | null> {
  const now = await raidWeatherOf(mapId, at);
  if (!now) return null;
  const [odds, climate] = await Promise.all([
    known ?? readWeatherOdds(at, mapId),
    readWeatherClimate(mapId, at),
  ]);
  return {
    now,
    levels: nextLevelOdds(now.level, odds, climate),
    temps: nextTempOdds(now.temperatureC, odds, climate),
    climate,
  };
}
