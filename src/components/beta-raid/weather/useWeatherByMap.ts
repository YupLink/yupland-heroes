// Погода нескольких карт для показа выхода «в час» (lib/raid/weatherYield).
//
// Каждая карта — свой getRaidWeather с ключом ["raid-weather", mapId]: тот же
// кэш, что у панели погоды и цены хода (useMoveMult), поэтому карта игрока уже
// известна без запроса, а этажи — по запросу на карту (их немного, ответ из кэша
// процесса на сервере). Перечитка — к смене слота (nextAt), без F5. Острова —
// без запроса (погоды там нет).
import { useQueries } from "@tanstack/react-query";
import { getRaidWeather } from "@/server/api/beta-raid/weather/weather-get";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { weatherByMapOf, type MapWeatherShown, type WeatherByMap } from "@/lib/raid/weatherYield";
import { useRaidMapId } from "@/components/beta-raid/useEnergyMult";
import { weatherRefetchMs } from "@/components/beta-raid/useMoveMult";

/** Погода карт (свежая); нет ответа, остров — карты в ответе нет. */
export function useWeatherByMap(mapIds: ReadonlyArray<string | null | undefined>): WeatherByMap {
  const ids = [...new Set(mapIds)].filter((id): id is string => !!id && !isIslandMapId(id)).sort();
  const replies = useQueries({
    queries: ids.map((mapId) => ({
      queryKey: ["raid-weather", mapId],
      queryFn: () => getRaidWeather({ data: { mapId } }),
      refetchInterval: (q: { state: { data?: { nextAt?: number } | null } }) =>
        weatherRefetchMs(q.state.data?.nextAt),
      staleTime: (q: { state: { data?: { nextAt?: number } | null } }) =>
        Number(q.state.data?.nextAt) > Date.now() ? 60_000 : 0,
    })),
  });
  return weatherByMapOf(
    replies.map((r, i) => (r.data && r.data.mapId === ids[i] ? r.data : null)),
    Date.now(),
  );
}

/** Погода карты игрока (окно поля, окно шахты); off — без запроса. */
export function useMyMapWeather(on = true): MapWeatherShown | undefined {
  const mapId = useRaidMapId();
  return useWeatherByMap(on ? [mapId] : []).get(mapId ?? "");
}
