// Где на карте замок и рисовать ли его картинку (владелец, 10.10.2026:
// центральный замок убран, замок главного мира — ратуша Юпленда).
//
// Клетку отдаёт сервер (состояние рейда, hero.castle — castleCell с настройкой
// 'beta_raid_castle'); нет ответа — центр карты, как было. Картинку замка
// рисуем, только если на клетке нет постройки: стоит ратуша — она и есть замок.
import { useMemo } from "react";
import { getCastlePositionAxial } from "./hexGeometry";
import type { MapStore } from "./mapStore";

export function useRaidCastle(
  map: { size: number; main?: boolean },
  store: MapStore | null | undefined,
  fromServer: { q: number; r: number } | null | undefined,
) {
  const sq = fromServer?.q;
  const sr = fromServer?.r;
  const castle = useMemo(
    () => (sq != null && sr != null ? { q: sq, r: sr } : getCastlePositionAxial(map.size)),
    [sq, sr, map.size],
  );
  // Замок только в главном мире (этажи): старый снимок без признака — как раньше.
  const castleShown = map.main !== false;
  const onBuilding = useMemo(() => {
    if (!store) return false;
    const i = store.indexOfKey(`${castle.q},${castle.r}`);
    return i >= 0 && !!store.buildingId(i);
  }, [store, castle]);
  return { castle, castleShown, castleArt: castleShown && !onBuilding };
}
