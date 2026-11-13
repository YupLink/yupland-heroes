// Шансы смены погоды в админке (владелец, 28.10.2026): шесть процентов, действуют со
// следующей смены погоды. Общие — settings.weather_odds; у мира могут быть свои
// (Ярослав 31.10.2026: «погоду по мирам тоже настраивать») — settings.weather_odds_world
// {mapId: шансы}, база берёт их поверх общих (weather-06). Числа проверены до записи.
// Климат мира (05.11.2026) — тут же в ответе (диапазоны, аномалия), пишет weather-climate-admin.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import {
  WEATHER_ODDS_DEFAULT,
  WEATHER_ODDS_KEYS,
  weatherOddsError,
  weatherOddsOf,
  type WeatherOdds,
} from "@/lib/raid/weatherOdds";
import {
  forgetWeatherOdds,
  readWeatherOddsStrict,
} from "@/server/api/beta-raid/weather/weather-odds";
import { weatherWorldsSql } from "@/server/api/weather-station/wstation-list";
import { weatherClimateOf } from "@/lib/raid/weatherClimate";
import { worldClimateRaw } from "@/server/api/beta-raid/weather/weather-climate";

const pct = z.number().int().min(0).max(100);
const mapIdField = z.string().min(1).max(128).nullish();
const oddsInput = z
  .object({
    clearToOvercast: pct,
    overcastToClear: pct,
    overcastToStorm: pct,
    stormToOvercast: pct,
    tempDown: pct,
    tempUp: pct,
    /** Мир — свои шансы мира; нет — общие. */
    mapId: mapIdField,
  })
  .strict();

type World = { id: string; name: string };

/** Миры с погодой (как у метеостанции, скрытые тоже). */
export async function weatherWorlds(): Promise<World[]> {
  const rows = ((await mcpExec(weatherWorldsSql, { wrapJson: true })) ?? []) as World[];
  return rows.map((r) => ({ id: String(r.id), name: String(r.name || r.id) }));
}

/** Свои шансы мира, как записаны; нет — null. */
async function worldOwnOdds(mapId: string): Promise<WeatherOdds | null> {
  const rows = (await mcpExec(
    `SELECT s.value::jsonb -> ${sqlStr(mapId)} AS odds FROM yuplink.settings s
      WHERE s.key = 'weather_odds_world'`,
    { wrapJson: true },
  )) as Array<{ odds: unknown }> | null;
  const raw = rows?.[0]?.odds;
  return raw && typeof raw === "object" ? weatherOddsOf(raw) : null;
}

export async function requireWorld(mapId: string): Promise<void> {
  if (!(await weatherWorlds()).some((w) => w.id === mapId)) throw new Error("Мир не найден");
}

export const adminGetWeatherOdds = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ mapId: mapIdField }).optional().parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const mapId = data?.mapId ?? null;
    const [odds, worlds, own, climate] = await Promise.all([
      readWeatherOddsStrict(Date.now(), mapId),
      weatherWorlds(),
      mapId ? worldOwnOdds(mapId) : null,
      mapId ? worldClimateRaw(mapId) : null,
    ]);
    return {
      odds,
      defaults: { ...WEATHER_ODDS_DEFAULT },
      worlds,
      own: !!own,
      /** Климат мира (как сохранён; нет — как всегда); общим шансам — null. */
      climate: mapId ? weatherClimateOf(climate) : null,
    };
  });

export const adminSetWeatherOdds = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => oddsInput.parse(data))
  .handler(async ({ data }) => {
    requireAdmin();
    const { mapId, ...rest } = data;
    const odds: WeatherOdds = { ...rest };
    const bad = weatherOddsError(odds);
    if (bad) throw new Error(bad);
    const json = JSON.stringify(odds);
    let back: WeatherOdds | null;
    if (mapId) {
      await requireWorld(mapId);
      const one = `jsonb_build_object(${sqlStr(mapId)}, ${sqlStr(json)}::jsonb)`;
      await mcpExec(
        `INSERT INTO yuplink.settings (key, value) VALUES ('weather_odds_world', ${one}::text)
         ON CONFLICT (key) DO UPDATE SET value =
           (CASE WHEN jsonb_typeof(yuplink.settings.value::jsonb) = 'object'
                 THEN yuplink.settings.value::jsonb ELSE '{}'::jsonb END || ${one})::text
         RETURNING value`,
        { wrapJsonCte: true },
      );
      back = await worldOwnOdds(mapId);
    } else {
      const rows = (await mcpExec(
        `INSERT INTO yuplink.settings (key, value) VALUES ('weather_odds', ${sqlStr(json)})
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value RETURNING value`,
        { wrapJsonCte: true },
      )) as Array<{ value: string }> | null;
      const saved = rows?.[0]?.value;
      back = typeof saved === "string" ? weatherOddsOf(JSON.parse(saved)) : null;
    }
    if (!back || WEATHER_ODDS_KEYS.some((k) => back[k] !== odds[k]))
      throw new Error("Не удалось сохранить шансы погоды");
    forgetWeatherOdds();
    return { odds };
  });

/** Мир — снова на общих шансах. */
export const adminResetWorldWeatherOdds = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ mapId: z.string().min(1).max(128) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await mcpExec(
      `UPDATE yuplink.settings SET value = (value::jsonb - ${sqlStr(data.mapId)})::text
        WHERE key = 'weather_odds_world' AND jsonb_typeof(value::jsonb) = 'object'
        RETURNING key`,
      { wrapJsonCte: true },
    );
    forgetWeatherOdds();
    return { ok: true as const };
  });
