// Своё имя игрока (lib/playerName): профиль показывает его вместо @ника.
import { useQuery } from "@tanstack/react-query";
import { getMyName } from "@/server/api/player-name/player-name-fns";

export const MY_NAME_KEY = ["my-name"] as const;

export function useMyName(enabled = true) {
  return useQuery({
    queryKey: MY_NAME_KEY,
    queryFn: () => getMyName(),
    staleTime: 5 * 60_000,
    enabled,
  });
}
