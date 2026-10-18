// Мои шахты с накопленной добычей — для плашки сбора над картой рейда.
// Один кэш на приложение; захват/сбор инвалидируют MINE_PENDINGS_KEY.
// Механика админ-онли: у обычного игрока список пустой.
import { useQuery } from "@tanstack/react-query";
import { getMyMinePendings, type MineRow } from "@/server/api/beta-raid/mine-pendings";

export const MINE_PENDINGS_KEY = ["beta-raid-mine-pendings"] as const;
export type { MineRow };

export function useMinePendings() {
  return useQuery({
    queryKey: MINE_PENDINGS_KEY,
    queryFn: () => getMyMinePendings(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
