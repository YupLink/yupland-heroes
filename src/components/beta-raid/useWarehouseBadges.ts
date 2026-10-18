// Бейджи складов на карте: сколько моих и общих ЕДИНИЦ товара к сбору на каждом.
//
// Отдельным хуком, а не строками в BetaRaidScreen (он давно за лимитом).
// SSE о складе не ходит — операций до сотни в час, и будить каждого клиента
// на каждый тап по полке дорого; хватает опроса раз в минуту плюс локальной
// инвалидации у того, кто сам положил/забрал (WarehouseAction.refresh).
import { useQuery } from "@tanstack/react-query";
import { getWarehouseBadges } from "@/server/api/beta-raid/warehouse-badges";

export const WAREHOUSE_BADGES_KEY = ["beta-raid-warehouse-badges"] as const;

export function useWarehouseBadges() {
  return useQuery({
    queryKey: WAREHOUSE_BADGES_KEY,
    queryFn: () => getWarehouseBadges(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
