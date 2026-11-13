// Множитель хода героя и судна на клиенте — тот же, что спишет сервер
// (server/api/beta-raid/move-weather.ts): остров новичка ×0,1 и погода карты
// (владелец, 26.10.2026) — ход героя × «ход героя», посадка и гребок × «ход корабля».
//
// Погода — getRaidWeather через react-query (ключ ["raid-weather", mapId]),
// перечитывается к смене слота (nextAt). Пока ответа нет, на острове и при выключенном
// влиянии — коэффициенты 1, и цены (кружки, маршрут, «докуда хватит энергии», окно
// корабля) ровно прежние. Множитель запомнен: маршрут не пересчитывается каждый кадр.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRaidWeather } from "@/server/api/beta-raid/weather/weather-get";
import { energyMultOf } from "@/lib/raid/island/energy";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { moveMultOf, type MoveMult } from "@/lib/shipRules";
import { useRaidMapId } from "./useEnergyMult";

/** Повтор, пока слот не известен (погоды ещё нет, сбой). */
const RETRY_MS = 60_000;

/** Через сколько перечитать погоду: к смене слота (nextAt, мс) с запасом в секунду. */
export function weatherRefetchMs(nextAt: unknown, now = Date.now()): number {
  const at = Number(nextAt);
  return Number.isFinite(at) && at > now ? at - now + 1_000 : RETRY_MS;
}

/** Погода карты игрока (react-query); остров и нет карты — без запроса. */
export function useRaidWeather(mapId: string | null | undefined) {
  return useQuery({
    queryKey: ["raid-weather", mapId],
    queryFn: () => getRaidWeather({ data: { mapId: String(mapId) } }),
    enabled: !!mapId && !isIslandMapId(mapId),
    refetchInterval: (q) => weatherRefetchMs(q.state.data?.nextAt),
    // Слот из сохранённого кэша (перезагрузка) уже сменился — сразу перечитать.
    staleTime: (q) => (Number(q.state.data?.nextAt) > Date.now() ? 60_000 : 0),
  });
}

/** Множитель хода на карте игрока сейчас (shipRules.MoveMult). */
export function useMoveMult(): MoveMult {
  const mapId = useRaidMapId();
  const coefs = useRaidWeather(mapId).data?.coefs;
  const mapMult = energyMultOf(mapId);
  const step = coefs?.step ?? 1;
  const ship = coefs?.ship ?? 1;
  return useMemo(() => moveMultOf(mapMult, { step, ship }), [mapMult, step, ship]);
}
