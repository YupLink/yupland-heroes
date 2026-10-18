// Что лежит на клетке на земле — сундук и мешочки — для окна клетки админа.
//
// Слои сундуков и мешочков у клиента — свои и вокруг героя, а окну нужен
// состав любой клетки: читаем его с сервера (god-move/move-ground). Перенос
// перечитывает ключ сам (godMoveApply).
import { useQuery } from "@tanstack/react-query";
import { getAdminCellGround } from "@/server/api/beta-raid/god-move/move-ground";
import { GROUND_KEY } from "@/components/beta-raid/god-move/godMoveApply";

export function useCellGround(q: number, r: number) {
  return useQuery({
    queryKey: [GROUND_KEY, q, r],
    queryFn: () => getAdminCellGround({ data: { q, r } }),
    staleTime: 2_000,
    retry: false,
  });
}
