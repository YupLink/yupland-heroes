// Рюкзак основного героя для витрины: тот же ключ, что у рюкзака в замке и на
// складе, — общий кэш, лишнего запроса маркет не делает. Читают «Макс»
// (useMarketMax) и подсветка нехватки (useMarketShort); сделка ключ сбрасывает.
import { useQuery } from "@tanstack/react-query";
import { getMyBackpack } from "@/server/api/beta-raid/market-backpack-read";

export function useMyBackpack() {
  return useQuery({
    queryKey: ["my-hero-backpack"],
    queryFn: () => getMyBackpack(),
    staleTime: 30_000,
  });
}
