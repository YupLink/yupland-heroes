// Вышки, отработавшие у этого игрока: по ним ходим как по обычной клетке.
// Список крошечный (постройки редки), обновляется после разведки. Вынесено из
// BetaRaidScreen (лимит строк) без изменений.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { towerUsedCells } from "@/server/api/beta-raid/tower-used";

export function useTowerUsed(): Set<string> {
  const towerUsedQ = useQuery({
    queryKey: ["beta-raid-tower-used"],
    queryFn: () => towerUsedCells(),
    staleTime: 60_000,
  });
  return useMemo(() => new Set(towerUsedQ.data?.used ?? []), [towerUsedQ.data?.used]);
}
