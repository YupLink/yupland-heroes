// Погода карты для игрока (владелец, 26.10.2026): вид, уровень, температура,
// когда началась и когда сменится, и коэффициенты, которые применяются сейчас.
// effectsOn — влияние у текущего слота (fx, записан при создании слота): выключено —
// коэффициенты все 1; включение и выключение — со следующей смены погоды.
// Остров новичка или неизвестная карта — null. worldName — имя мира (raid_maps.name, Ярослав
// 29.10.2026: «подпись мира — Мидгард, ясно, минус 20»).
//
// Слот карты обеспечивается тут же (нет — дописывается цепочкой), заодно
// стартует обход всех карт процесса (weather-sweep). Клиентской обёртки нет —
// адаптер к панели погоды подключается отдельно.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import {
  weatherNextAt,
  type WeatherCoefs,
  type WeatherKind,
  type WeatherLevel,
} from "@/lib/raid/weather";
import { appliedCoefs, mapWeatherNow } from "@/server/api/beta-raid/weather/weather-read";
import { startWeatherSweeper } from "@/server/api/beta-raid/weather/weather-sweep";

export type RaidWeather = {
  mapId: string;
  kind: WeatherKind;
  level: WeatherLevel;
  temperatureC: number;
  /** Начало текущего слота, мс (UTC). */
  slotAt: number;
  /** Следующая смена погоды, мс (UTC). */
  nextAt: number;
  coefs: WeatherCoefs;
  effectsOn: boolean;
  /** Имя мира; не прочиталось — null (панель покажет без него). */
  worldName: string | null;
};

const NAME_TTL_MS = 60_000;
const names = new Map<string, { name: string | null; until: number }>();

/** Имя мира (кэш процесса на минуту: переименование доезжает за минуту). Сбой — null. */
async function worldNameOf(mapId: string, now: number): Promise<string | null> {
  const hit = names.get(mapId);
  if (hit && now < hit.until) return hit.name;
  try {
    const rows = (await mcpExec(`SELECT name FROM yuplink.raid_maps WHERE id = ${sqlStr(mapId)}`, {
      wrapJson: true,
    })) as Array<{ name: string | null }> | null;
    const name = rows?.[0]?.name?.trim() || null;
    names.set(mapId, { name, until: now + NAME_TTL_MS });
    return name;
  } catch {
    return null;
  }
}

const input = (d: unknown) => z.object({ mapId: z.string().min(1).max(128) }).parse(d);

/** Погода карты сейчас; нет погоды — null. */
export async function raidWeatherOf(mapId: string, now = Date.now()): Promise<RaidWeather | null> {
  const weather = await mapWeatherNow(mapId, now);
  if (!weather) return null;
  const worldName = await worldNameOf(mapId, now);
  return {
    mapId,
    kind: weather.kind,
    level: weather.level,
    temperatureC: weather.tempC,
    slotAt: weather.slotAt,
    nextAt: weatherNextAt(weather.slotAt).getTime(),
    coefs: appliedCoefs(weather),
    effectsOn: weather.fx,
    worldName,
  };
}

export const getRaidWeather = createServerFn({ method: "GET" })
  .inputValidator(input)
  .handler(async ({ data }): Promise<RaidWeather | null> => {
    await requireBetaRaid();
    startWeatherSweeper();
    return raidWeatherOf(data.mapId);
  });
