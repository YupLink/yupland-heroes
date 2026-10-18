// Поимённый список судов клетки — для выбора борта в окне корабля.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { shipsAtCell, type ShipAtCell } from "@/server/api/beta-raid/ship-list";

/** Список судов клетки. Пустой массив — пока грузится или их нет вовсе. */
export function useShipsAtCell(q: number, r: number): ShipAtCell[] {
  const shipsQ = useQuery({
    queryKey: ["beta-raid-ships-at", q, r],
    queryFn: () => shipsAtCell({ data: { q, r } }),
    staleTime: 10_000,
  });
  return shipsQ.data?.ships ?? [];
}

/**
 * Какой борт слушают кнопки окна. По умолчанию тот же, что выбрал бы сервер:
 * свой, иначе самый целый свободный (список приходит уже в этом порядке).
 */
export function usePickedShip(q: number, r: number) {
  const fleet = useShipsAtCell(q, r);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked =
    fleet.find((s) => s.id === pickedId) ??
    fleet.find((s) => s.mine) ??
    fleet.find((s) => !s.busy && !s.broken) ??
    fleet[0] ??
    null;
  return { fleet, picked, setPickedId };
}
