// Ачивки игрока — один запрос на экран профиля и панель острова.
import { useQuery } from "@tanstack/react-query";
import { getMyAchievements } from "@/server/api/achievements/read";

export const ACH_KEY = ["my-achievements"] as const;

export function useMyAchievements(enabled = true, pollMs: number | false = false) {
  return useQuery({
    queryKey: ACH_KEY,
    queryFn: () => getMyAchievements(),
    enabled,
    staleTime: 15_000,
    refetchInterval: pollMs,
  });
}
