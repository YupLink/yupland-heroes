// Хук к marketShort: тот же счёт (usePlayerFunds) и тот же рюкзак, что у
// кнопки «Макс» (useMyBackpack, общий кэш), — подсветка нехватки и потолок
// «Макс» не разойдутся. Сделка сбрасывает оба кэша (useMarketCheckout), так что
// красное гаснет сразу после покупки, без перезагрузки.
import type { CostEntry } from "./cartCost";
import { shortKeys } from "./marketShort";
import { useMyBackpack } from "./useMyBackpack";
import { usePlayerFunds } from "./usePlayerFunds";

/** (строки цены) → ключи costKey, которых игроку сейчас не хватает. */
export function useMarketShort(): (costs: readonly CostEntry[]) => Set<string> {
  const have = usePlayerFunds();
  const stacks = useMyBackpack().data?.stacks;
  return (costs) => shortKeys(costs, { have, stacks });
}
