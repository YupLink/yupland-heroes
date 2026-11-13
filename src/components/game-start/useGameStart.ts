// Ответ «новичок или уже играет» для меню входа. Ключ не сохраняется в
// localStorage (query.ts). Решение одно на загрузку страницы: ответ не
// устаревает и не перечитывается ни при возврате сети, ни при возврате на
// вкладку — иначе меню встало бы посреди игры.
import { useQuery } from "@tanstack/react-query";
import { getGameStart } from "@/server/api/game-start";

export const GAME_START_KEY = "game-start";

export function useGameStartStatus(enabled: boolean, wallet: string | null | undefined) {
  return useQuery({
    queryKey: [GAME_START_KEY, wallet ?? ""],
    queryFn: () => getGameStart(),
    enabled: enabled && !!wallet,
    staleTime: Infinity,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    // Один повтор: пока ответа нет, заставка держится — долго ждать нельзя.
    retry: 1,
  });
}
