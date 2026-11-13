import {useTownHallPurchaseSuccess} from './TownHallPurchaseSuccess';
// Ратуша замка (ПРАВИЛА §8.64): состояние и покупки для карточек Ратуши и окна
// храма. После улучшения и покупки — Ратуша, храм и ресурсы обновляются без F5.
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { getTownHall, upgradeTownHall } from "@/server/api/castle-townhall/townhall-state";
import { buyCastleBuilding } from "@/server/api/castle-townhall/townhall-buy";
import { setTownHallDecorPrice } from "@/server/api/castle-townhall/townhall-decor-price";
import { TEMPLE_KEY } from "./temple/templeUi";

export const TOWN_HALL_KEY = ["castle-townhall"] as const;

export function refreshTownHall(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: TOWN_HALL_KEY });
  void qc.invalidateQueries({ queryKey: TEMPLE_KEY });
  void qc.invalidateQueries({ queryKey: RESOURCES_KEY, refetchType: "all" });
}

export function useTownHall() {
  return useQuery({ queryKey: TOWN_HALL_KEY, queryFn: () => getTownHall(), staleTime: 30_000, retry: 1 });
}

export function useUpgradeTownHall(ru: boolean) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fromLevel: number) => upgradeTownHall({ data: { fromLevel, opId: newOpId() } }),
    onSuccess: (r) => {
      toast.success(ru ? `Ратуша — уровень ${r.level}` : `Town Hall — level ${r.level}`);
    },
    onError: (e: unknown) => toast.error(humanError(e)),
    onSettled: () => refreshTownHall(qc),
  });
}

/** Покупка здания каталога (сейчас — Храм). */
export function useBuyBuilding(ru: boolean, name: [string, string]) {
  const purchaseSuccess=useTownHallPurchaseSuccess();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: string) => buyCastleBuilding({ data: { kind, opId: newOpId() } }),
    onSuccess: (_result, kind) => {
      purchaseSuccess({kind:'building',id:kind});
      toast.success(ru ? `${name[0]}: куплено` : `${name[1]}: purchased`);
    },
    onError: (e: unknown) => toast.error(humanError(e)),
    onSettled: () => refreshTownHall(qc),
  });
}

/** Карандаш цены декора (админ и дизайнер): цена вида в золоте. */
export function useSetDecorPrice(ru: boolean) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { kind: string; gold: number }) => setTownHallDecorPrice({ data: d }),
    onSuccess: () => toast.success(ru ? "Цена сохранена" : "Price saved"),
    onError: (e: unknown) => toast.error(humanError(e)),
    onSettled: () => void qc.invalidateQueries({ queryKey: TOWN_HALL_KEY }),
  });
}

