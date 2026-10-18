// Ключи окна аукционов и «обновить всё, что могла сдвинуть ставка или лот»:
// счёт, энергия, ресурсы, рюкзак, мой дом и мои вещи — без перезагрузки.
import type { QueryClient } from "@tanstack/react-query";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";

export const LIVE_KEY = ["auctions", "live"] as const;
export const HOUSE_KEY = ["auction-house"] as const;
export const GOODS_KEY = ["auction-my-goods"] as const;

export function refreshAuctionData(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: LIVE_KEY });
  void qc.invalidateQueries({ queryKey: HOUSE_KEY });
  void qc.invalidateQueries({ queryKey: GOODS_KEY });
  void qc.invalidateQueries({ queryKey: ["my-hero-backpack"], refetchType: "all" });
  void qc.invalidateQueries({ queryKey: ENERGY_KEY, refetchType: "all" });
  void qc.invalidateQueries({ queryKey: RESOURCES_KEY, refetchType: "all" });
  void qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY, refetchType: "all" });
}
