// «Метеостанция»: данные окна и часы обратного отсчёта.
//
// Отсчёт — по часам СЕРВЕРА (как у «Управления шахтами»: ответ несёт serverNow,
// запрос ставит clientAt — середину запроса; сбитые часы телефона не
// сдвигают смену). Перечитываем чуть позже ближайшей смены — сервер уже на
// новом слоте; иначе раз в минуту (админ мог поправить шансы).
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WEATHER_STATION_KEY } from "@/lib/weatherStationBus";
import { mineServerNow, type MineClockStamps } from "@/lib/mineV2Clock";
import {
  getWeatherStation,
  type StationWorld,
  type WeatherStationView,
} from "@/server/api/weather-station/wstation-list";

export const WEATHER_STATION_WORLDS_KEY = [...WEATHER_STATION_KEY, "worlds"] as const;

type Stamped = WeatherStationView & { clientAt: number };

async function fetchStation(): Promise<Stamped> {
  const sent = Date.now();
  const res = await getWeatherStation();
  return { ...res, clientAt: Math.round((sent + Date.now()) / 2) };
}

const POLL_MS = 60_000;
const MIN_MS = 5_000;
/** Запас после смены: слот на сервере уже новый. */
const AFTER_MS = 2_000;

/** Через сколько перечитать: после ближайшей смены, но не реже раза в минуту и не чаще раза в 5 с. */
export function stationRefetchMs(worlds: readonly StationWorld[], now: number): number {
  if (worlds.length === 0) return POLL_MS;
  const next = Math.min(...worlds.map((w) => w.nextAt));
  return Math.min(POLL_MS, Math.max(MIN_MS, next - now + AFTER_MS));
}

/** Окно открыли — свежие миры; дальше — по stationRefetchMs. */
export function useWeatherStationWorlds() {
  return useQuery({
    queryKey: WEATHER_STATION_WORLDS_KEY,
    queryFn: fetchStation,
    staleTime: 0,
    retry: 1,
    refetchInterval: (q) => {
      const d = q.state.data;
      return d ? stationRefetchMs(d.worlds, mineServerNow(d, Date.now())) : POLL_MS;
    },
  });
}

/** Сейчас по часам сервера; тикает раз в секунду, пока есть что отсчитывать. */
export function useStationNow(clock: MineClockStamps | undefined, live: boolean): number {
  const [device, setDevice] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setDevice(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  return mineServerNow(clock, device);
}
