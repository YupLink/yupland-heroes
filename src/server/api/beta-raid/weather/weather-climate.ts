// Климат мира на сервере (владелец, 05.11.2026; migrations/weather-08-climate.sql).
//
// readWeatherClimate — тот же климат, по которому база бросает погоду мира: функция базы
// raid_weather_climate(mapId) (settings.weather_climate_world, битое или нет — как всегда).
// Кэш процесса на минуту на мир; сбой базы (в том числе до наката weather-08 — функции ещё
// нет, база климат не знает) — как всегда, в кэш не кладём.
//
// worldClimateRaw — запись мира как есть (админке: «свой» ли климат у мира).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import {
  WEATHER_CLIMATE_DEFAULT,
  weatherClimateOf,
  type WeatherClimate,
} from "@/lib/raid/weatherClimate";

const TTL_MS = 60_000;
const cached = new Map<string, { climate: WeatherClimate; until: number }>();

/** Климат мира, по которому бросает база; сбой — как всегда. */
export async function readWeatherClimate(mapId: string, now = Date.now()): Promise<WeatherClimate> {
  const hit = cached.get(mapId);
  if (hit && now < hit.until) return hit.climate;
  try {
    const rows = (await mcpExec(
      `SELECT yuplink.raid_weather_climate(${sqlStr(mapId)}) AS climate`,
      { wrapJson: true },
    )) as Array<{ climate: unknown }> | null;
    const raw = rows?.[0]?.climate;
    if (!raw || typeof raw !== "object") throw new Error("нет климата");
    const climate = weatherClimateOf(raw);
    cached.set(mapId, { climate, until: now + TTL_MS });
    return climate;
  } catch (e) {
    console.warn("[weather] климат:", mapId, e instanceof Error ? e.message : e);
    return WEATHER_CLIMATE_DEFAULT;
  }
}

/** Админ сохранил климат — этот процесс перечитает сразу, остальные — в пределах минуты. */
export const forgetWeatherClimate = (): void => {
  cached.clear();
};

/** Запись климата мира в настройке как есть; нет — null. */
export async function worldClimateRaw(mapId: string): Promise<unknown> {
  const rows = (await mcpExec(
    `SELECT s.value::jsonb -> ${sqlStr(mapId)} AS climate FROM yuplink.settings s
      WHERE s.key = 'weather_climate_world'`,
    { wrapJson: true },
  )) as Array<{ climate: unknown }> | null;
  return rows?.[0]?.climate ?? null;
}
