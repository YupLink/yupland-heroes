// Погода карты на сервере (владелец, 26.10.2026; migrations/weather-01).
//
// mapWeatherNow — слот карты: из кэша процесса до конца слота, иначе одной
// функцией базы raid_weather_ensure (нет слота — дописать цепочкой; до 4
// процессов разом — база кладёт один раз, остальные читают легшее). Остров
// новичка — null без запроса; неизвестная карта — null (минуту не спрашиваем).
//
// mapWeatherCoefs — коэффициенты, которые применяются сейчас: остров, нет
// погоды или у слота fx = false — все 1. fx пишется при создании слота
// (settings.weather_effects = 'on' в тот момент) и не меняется: включение и
// выключение действуют со следующей смены погоды, прошлое не пересчитывается.
// Строка слота читается раз за слот — шаг героя в базу не ходит. Сбой базы —
// все 1 (шаг не падает из-за погоды), в кэш не кладём.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { isIslandMapId } from "@/lib/raid/island/ids";
import {
  NO_WEATHER,
  weatherNextAt,
  isWeatherKind,
  isWeatherLevel,
  weatherCoefs,
  type WeatherCoefs,
  type WeatherKind,
  type WeatherLevel,
} from "@/lib/raid/weather";

export type MapWeather = {
  mapId: string;
  /** Начало слота, мс. */
  slotAt: number;
  tempC: number;
  level: WeatherLevel;
  kind: WeatherKind;
  /** Влияние на экономику у этого слота (записано при создании слота). */
  fx: boolean;
};

/** Погоды у карты нет (неизвестная, остров по raid_island) — столько не спрашиваем снова. */
const MISS_TTL_MS = 60_000;
/** Карт больше не помним — кэш с нуля (карт в игре десятки). */
const CACHE_MAX = 200;

/** Слот карты на момент at: есть — он, нет — дописать; погоды нет — ни одной строки. */
export const ensureWeatherSql = (mapId: string, at: Date): string =>
  `SELECT w.slot_at, w.temp_c, w.level, w.kind, w.fx
     FROM yuplink.raid_weather_ensure(${sqlStr(mapId)}, ${sqlStr(at.toISOString())}::timestamptz) w
    WHERE w.map_id IS NOT NULL`;

/** Строка базы → погода слота; битая — null. fx — только true из базы. */
export function weatherOfRow(mapId: string, row: unknown): MapWeather | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const slotAt = Date.parse(String(r.slot_at ?? ""));
  const tempC = Number(r.temp_c);
  if (!Number.isFinite(slotAt) || !Number.isInteger(tempC)) return null;
  if (!isWeatherKind(r.kind) || !isWeatherLevel(r.level)) return null;
  return { mapId, slotAt, tempC, level: r.level, kind: r.kind, fx: r.fx === true };
}

type Entry = { weather: MapWeather | null; until: number };
const cache = new Map<string, Entry>();

/** Для тестов и после ручной правки погоды: забыть всё. */
export function resetWeatherCache(): void {
  cache.clear();
}

/** Погода карты сейчас (слот дописывается, если его нет). Остров, неизвестная карта — null. */
export async function mapWeatherNow(mapId: string, now = Date.now()): Promise<MapWeather | null> {
  if (isIslandMapId(mapId)) return null;
  const hit = cache.get(mapId);
  if (hit && now < hit.until) return hit.weather;
  const rows = (await mcpExec(ensureWeatherSql(mapId, new Date(now)), { wrapJson: true })) ?? [];
  const weather = weatherOfRow(mapId, rows[0]);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(mapId, {
    weather,
    until: weather ? weatherNextAt(weather.slotAt).getTime() : now + MISS_TTL_MS,
  });
  return weather;
}

/** Коэффициенты, которые даёт слот: влияние у слота выключено — все 1. */
export const appliedCoefs = (weather: MapWeather | null): WeatherCoefs =>
  weather?.fx ? weatherCoefs(weather.tempC, weather.kind) : { ...NO_WEATHER };

/** Коэффициенты карты сейчас: { fish, mine, farm, step, ship }; нет влияния — все 1. */
export async function mapWeatherCoefs(mapId: string, now = Date.now()): Promise<WeatherCoefs> {
  if (isIslandMapId(mapId)) return { ...NO_WEATHER };
  try {
    return appliedCoefs(await mapWeatherNow(mapId, now));
  } catch (e) {
    console.warn("[weather] коэффициенты карты:", mapId, e instanceof Error ? e.message : e);
    return { ...NO_WEATHER };
  }
}
