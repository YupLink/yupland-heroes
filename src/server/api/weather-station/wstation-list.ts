// «Метеостанция»: погода всех миров и шансы следующей смены — для окна в замке.
//
// Миры — те же, что обходит база (raid_weather_tick, migrations/weather-01):
// открытые карты и главный мир, кроме островов. Погода и шансы — тем же
// прогнозом сервера (weatherForecastOf: слот карты + raid_weather_odds); погоды
// у карты нет — мира в окне нет. Шансы — уже с голосами шаманов этой смены
// (обряд — wstation-ritual.ts).
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import {
  weatherForecastOf,
  type WeatherForecast,
} from "@/server/api/beta-raid/weather/weather-odds";
import { WEATHER_LEVELS, type WeatherKind, type WeatherLevel } from "@/lib/raid/weather";
import type { Chance } from "@/lib/raid/weatherOdds";
import {
  applyVotes,
  levelVotes,
  ritualTargets,
  tempVotes,
  withAnomalyLevels,
  type RitualTarget,
  type RitualVotes,
} from "@/lib/raid/weatherRitual";
import { WEATHER_CLIMATE_DEFAULT } from "@/lib/raid/weatherClimate";
import { requireWeatherStation, stationAccount } from "./wstation-own";
import { isAdminWallet } from "@/server/auth";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { ritualState, type RitualState } from "./wstation-ritual";

export type StationWorld = {
  mapId: string;
  name: string;
  kind: WeatherKind;
  temperatureC: number;
  /** Следующая смена погоды, мс (UTC). */
  nextAt: number;
  /** Уровень после смены: ясно → шторм, нулевые шансы убраны, %. */
  levels: Chance<WeatherLevel>[];
  /** Температура после смены: по возрастанию, нулевые убраны, %. */
  temps: Chance<number>[];
  /** Голоса шаманов в эту смену. */
  votes: RitualVotes;
  /** За что можно провести обряд сейчас. */
  targets: RitualTarget[];
  /** Скрыт админом из станции (видит только админ — чтобы вернуть). */
  hidden: boolean;
};

export type WeatherStationView = {
  worlds: StationWorld[];
  serverNow: number;
  /** Админ: переименовать мир и скрыть его из станции. */
  admin: boolean;
} & Pick<RitualState, "mine" | "shamans">;

type WorldRow = { id: string; name: string | null; hidden?: boolean };

/**
 * Миры с погодой — тот же отбор, что в raid_weather_tick; hidden — админ убрал мир из
 * станции (settings.wstation_hidden — тестовые миры, владелец 29.10.2026).
 */
export const weatherWorldsSql = `SELECT rm.id, rm.name,
          rm.id IN (SELECT jsonb_array_elements_text(COALESCE(
                      (SELECT s.value::jsonb FROM yuplink.settings s WHERE s.key = 'wstation_hidden'),
                      '[]'::jsonb))) AS hidden
     FROM yuplink.raid_maps rm
    WHERE (rm.active OR rm.id = (SELECT (s.value::jsonb)->>'mapId'
                                   FROM yuplink.settings s WHERE s.key = 'beta_raid_map'))
      AND left(rm.id, 5) <> 'isle_'
      AND NOT EXISTS (SELECT 1 FROM yuplink.raid_island i WHERE i.map_id = rm.id)
    ORDER BY rm.id;`;

const levelOrder = (l: WeatherLevel): number => WEATHER_LEVELS.indexOf(l);

/**
 * Мир + прогноз (+ голоса этой смены) → блок окна. Климат мира: голоса и цели обряда — по
 * его лестнице и уровням; температура может уйти в аномалию — тогда шторм (доля в уровнях).
 */
export function stationWorld(
  row: WorldRow,
  f: WeatherForecast,
  votes: RitualVotes = {},
): StationWorld {
  const climate = f.climate ?? WEATHER_CLIMATE_DEFAULT;
  const temps = applyVotes(f.temps, tempVotes(f.now.temperatureC, votes, climate));
  const levels = withAnomalyLevels(applyVotes(f.levels, levelVotes(votes)), temps);
  return {
    mapId: row.id,
    name: row.name?.trim() || row.id,
    kind: f.now.kind,
    temperatureC: f.now.temperatureC,
    nextAt: f.now.nextAt,
    levels: levels.filter((c) => c.p > 0).sort((a, b) => levelOrder(a.value) - levelOrder(b.value)),
    temps: temps.filter((c) => c.p > 0).sort((a, b) => a.value - b.value),
    votes,
    targets: ritualTargets(f.now, climate),
    hidden: row.hidden === true,
  };
}

/** Все миры с погодой, по названию. */
export async function stationWorlds(
  at = Date.now(),
  votes: Record<string, RitualVotes> = {},
  withHidden = false,
): Promise<StationWorld[]> {
  const all = ((await mcpExec(weatherWorldsSql, { wrapJson: true })) ?? []) as WorldRow[];
  const rows = withHidden ? all : all.filter((r) => r.hidden !== true);
  // Один мир споткнулся о базу — пропускаем его, остальные показываем. Шансы — свои у мира.
  const list = await Promise.all(
    rows.map(async (row) => {
      try {
        const f = await weatherForecastOf(row.id, at);
        return f ? stationWorld(row, f, votes[row.id]) : null;
      } catch (e) {
        console.warn("[wstation] мир", row.id, e instanceof Error ? e.message : e);
        return null;
      }
    }),
  );
  return list
    .filter((w): w is StationWorld => w !== null)
    .sort((a, b) => a.name.localeCompare(b.name) || a.mapId.localeCompare(b.mapId));
}

/** Окно «Метеостанция»: только у построивших; стоять в замке не нужно. */
export const getWeatherStation = createServerFn({ method: "GET" }).handler(
  async (): Promise<WeatherStationView> => {
    const account = await stationAccount();
    await requireWeatherStation(account);
    const admin = isAdminWallet(await requireBetaRaid());
    const ritual = await ritualState(account);
    const worlds = await stationWorlds(Date.now(), ritual.votes, admin);
    return { worlds, serverNow: Date.now(), admin, mine: ritual.mine, shamans: ritual.shamans };
  },
);
