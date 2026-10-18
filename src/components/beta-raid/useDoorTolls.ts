// Цены дверей карты на клиенте: один запрос на открытие экрана рейда.
//
// Нужны двум потребителям: поиску маршрута — какие двери можно открыть
// сквозь (hardDoors), и плашке маршрута — сколько это будет стоить (tolls).
// Цена меняется редко (админ), поэтому минута свежести; правку по клетке
// двери живой поток сбрасывает событием «built» (useRaidLiveStream).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBetaDoorTolls, type DoorTolls } from "@/server/api/beta-raid/gate-tolls";
import { hardDoorsOf, type DoorTollMap } from "./pathTolls";

export const DOOR_TOLLS_KEY = ["beta-raid-door-tolls"] as const;
/** Ключ по карте: после перехода порталом на другой этаж цены старого не годятся. */
export const doorTollsKey = (mapId: string | null) => [...DOOR_TOLLS_KEY, mapId ?? ""] as const;

export function useDoorTolls(
  doors: ReadonlySet<string>,
  /** Уровень выбранного героя; null — героя нет (рамки уровня не пройти). */
  heroLevel: number | null,
  /** Карта, для которой считаем: ручка отвечает по текущей карте игрока. */
  mapId: string | null = null,
): { tolls: DoorTollMap | undefined; hardDoors: ReadonlySet<string> | undefined } {
  const q = useQuery({
    queryKey: doorTollsKey(mapId),
    queryFn: () => getBetaDoorTolls() as Promise<DoorTolls>,
    enabled: !!mapId,
    staleTime: 60_000,
  });
  const tolls = q.data?.doors;
  const hardDoors = useMemo(() => hardDoorsOf(doors, tolls, heroLevel), [doors, tolls, heroLevel]);
  return { tolls, hardDoors };
}
