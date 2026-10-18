// Ресурсы игрока с шахт (gold/stone/diamonds/wood) — один кэш на приложение,
// как энергия. Обновляется без F5: захват/добыча инвалидируют RESOURCES_KEY.
import { useQuery } from "@tanstack/react-query";
import { getMyResources, type MineResources } from "@/server/api/beta-raid/my-resources";

export const RESOURCES_KEY = ["my-resources"] as const;
export type { MineResources };

export function useResources() {
  return useQuery({
    queryKey: RESOURCES_KEY,
    queryFn: () => getMyResources(),
    staleTime: 10_000,
  });
}
