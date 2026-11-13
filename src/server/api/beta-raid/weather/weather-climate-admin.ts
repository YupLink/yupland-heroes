// Климат мира в админке (владелец, 05.11.2026): диапазон температуры (−40…+40 через 10),
// уровни подряд, аномалия — холод / жара / нет. settings.weather_climate_world {mapId: климат};
// климат «как всегда» не хранится (ключ мира убирается). Проверка — та же, что у клиента и
// базы (weatherClimateError / raid_weather_climate); действует со следующей смены погоды.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { WEATHER_ANOMALIES, WEATHER_LEVELS } from "@/lib/raid/weather";
import {
  isDefaultClimate,
  weatherClimateError,
  weatherClimateOf,
  type WeatherClimate,
} from "@/lib/raid/weatherClimate";
import { requireWorld } from "@/server/api/beta-raid/weather/weather-odds-admin";
import {
  forgetWeatherClimate,
  worldClimateRaw,
} from "@/server/api/beta-raid/weather/weather-climate";

const climateInput = z
  .object({
    mapId: z.string().min(1).max(128),
    tempMin: z.number().int(),
    tempMax: z.number().int(),
    levels: z.array(z.enum(WEATHER_LEVELS)).min(1).max(WEATHER_LEVELS.length),
    anomaly: z.enum(WEATHER_ANOMALIES).nullable(),
  })
  .strict();

const sameClimate = (a: WeatherClimate, b: WeatherClimate): boolean =>
  a.tempMin === b.tempMin &&
  a.tempMax === b.tempMax &&
  a.anomaly === b.anomaly &&
  a.levels.join() === b.levels.join();

/** SQL: убрать климат мира из настройки. */
const dropSql = (mapId: string): string =>
  `UPDATE yuplink.settings SET value = (value::jsonb - ${sqlStr(mapId)})::text
    WHERE key = 'weather_climate_world' AND jsonb_typeof(value::jsonb) = 'object'
    RETURNING key`;

/** SQL: записать климат мира (поверх остальных миров). */
const putSql = (mapId: string, json: string): string => {
  const one = `jsonb_build_object(${sqlStr(mapId)}, ${sqlStr(json)}::jsonb)`;
  return `INSERT INTO yuplink.settings (key, value) VALUES ('weather_climate_world', ${one}::text)
    ON CONFLICT (key) DO UPDATE SET value =
      (CASE WHEN jsonb_typeof(yuplink.settings.value::jsonb) = 'object'
            THEN yuplink.settings.value::jsonb ELSE '{}'::jsonb END || ${one})::text
    RETURNING value`;
};

export const adminSetWeatherClimate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => climateInput.parse(data))
  .handler(async ({ data }) => {
    requireAdmin();
    const { mapId, ...rest } = data;
    const climate: WeatherClimate = { ...rest };
    const bad = weatherClimateError(climate);
    if (bad) throw new Error(bad);
    await requireWorld(mapId);
    if (isDefaultClimate(climate)) {
      await mcpExec(dropSql(mapId), { wrapJsonCte: true });
    } else {
      await mcpExec(putSql(mapId, JSON.stringify(climate)), { wrapJsonCte: true });
    }
    const back = weatherClimateOf(await worldClimateRaw(mapId));
    if (!sameClimate(back, climate)) throw new Error("Не удалось сохранить климат мира");
    forgetWeatherClimate();
    return { climate: back };
  });
