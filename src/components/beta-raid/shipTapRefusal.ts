// Отказ по тапу «до судна не добраться»: чем объяснить и что перечитать.
//
// Текст «До свободного корабля не добраться посуху» рождается ТОЛЬКО здесь, на
// клиенте, из кэша причалов (useShips: 10 с свежести, опрос раз в 60 с) — сервер
// такого отказа не даёт. После собственного схода с борта кэш ещё держал своё
// судно «занятым», и поиск пути отказывал там, где сервер пустил бы (жалоба
// 20.09: «была на корабле, сделала ход на 2 шага, теперь не могу двигаться»).
//
// Поэтому на отказе причалы и позиция перечитываются с сервера — следующий тап
// идёт по свежим данным без F5. Повторить обработчик тут же нельзя: он замкнут
// на пропсы текущего рендера и увидел бы те же старые причалы.
import type { QueryClient } from "@tanstack/react-query";
import { SHIPS_KEY } from "./patchShipsCache";
import { STATE_KEY } from "./stepCache";
import type { ShipMark } from "./drawShips";

/** На клетке только разбитые борта: сесть не на что, их можно лишь починить. */
export function isWreckOnly(mark: Pick<ShipMark, "free" | "busy" | "broken">): boolean {
  return mark.free <= 0 && mark.busy <= 0 && mark.broken > 0;
}

/** Отказ по тапу на дальнее судно — ключ перевода. */
export function farShipRefusalKey(mark: Pick<ShipMark, "free" | "busy" | "broken">): string {
  // Разбитый борт не «занят»: до него просто не доплыть — так и пишем, иначе
  // владелец собственного утонувшего судна читал про чужого игрока.
  if (mark.free > 0) return "braid.ship_unreachable";
  if (isWreckOnly(mark)) return "braid.ship_wreck_far";
  return "braid.ship_busy";
}

/**
 * Отказ по тапу на пустую воду. Свободное судно на карте есть, а маршрута нет —
 * значит до него не добраться посуху; «Нужен корабль» в таком случае врёт.
 */
export function waterRefusalKey(ships: ReadonlyMap<string, Pick<ShipMark, "free">>): string {
  for (const s of ships.values()) if (s.free > 0) return "braid.ship_unreachable";
  return "braid.need_ship";
}

/** Отказ мог родиться из протухшего кэша — сверяем причалы и позицию с сервером. */
export function refreshBerths(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: SHIPS_KEY });
  qc.invalidateQueries({ queryKey: STATE_KEY });
}
