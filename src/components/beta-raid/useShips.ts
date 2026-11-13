// Корабли на карте: где стоят и чьи.
//
// Как и лагеря игроков, приходят живым потоком: спустили корабль с верфи или
// кто-то занял свободный — соседние карты узнают об этом сразу, а редкий опрос
// остаётся страховкой на случай оборванного потока.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBetaRaidShips } from "@/server/api/beta-raid/ship-action";
import type { ShipMark } from "./drawShips";

export type { ShipMark } from "./drawShips";

export function useShips() {
  const q = useQuery({
    queryKey: ["beta-raid-ships"],
    // signal обязателен: без него отменённый рефетч всё равно доезжает до БД и
    // отрабатывает целиком. Причалы — это два похода в базу, и на морском
    // маршруте отменённых запросов набирается больше, чем нужных.
    queryFn: ({ signal }) => getBetaRaidShips({ signal }),
    staleTime: 10_000,
    refetchInterval: 60_000,
  });

  const ships = useMemo(() => {
    const map = new Map<string, ShipMark>();
    for (const s of q.data?.ships ?? [])
      map.set(`${s.q},${s.r}`, {
        total: s.total,
        busy: s.busy,
        free: s.free,
        mine: s.mine,
        big: s.big,
        freeBig: s.freeBig,
        mineBig: s.mineBig,
        broken: s.broken,
        blasted: s.blasted,
        blastedAt: s.blastedAt,
        hp: s.hp,
        hpMax: s.hpMax,
      });
    return map;
  }, [q.data]);

  /** Клетка своего корабля — с него можно сойти на берег. */
  const myShip = useMemo(() => {
    const hit = (q.data?.ships ?? []).find((s) => s.mine);
    return hit ? { q: hit.q, r: hit.r } : null;
  }, [q.data]);

  return { ships, myShip };
}
