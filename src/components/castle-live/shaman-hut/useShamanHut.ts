// «Хижина шаманов»: данные окна, покупка шамана и «Взять в рюкзак».
// После действия окно, ресурсы и рюкзак обновляются без F5.
import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import type { ShamanPrice } from "@/lib/shamanHut";
import { SHAMAN_HUT_KEY } from "@/lib/shamanHutBus";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { buyShaman, getShamanHut } from "@/server/api/shaman-hut/shaman-hut";
import { takeShamanToBackpack } from "@/server/api/shaman-hut/shaman-take";

export const SHAMAN_HUT_VIEW_KEY = [...SHAMAN_HUT_KEY, "view"] as const;

/** Окно открыли — свежие данные (админ мог поставить цену или характеристики). */
export function useShamanHutView() {
  return useQuery({
    queryKey: SHAMAN_HUT_VIEW_KEY,
    queryFn: () => getShamanHut(),
    staleTime: 0,
    retry: 1,
  });
}

/** Купить одного шамана. Ключ повтора живёт до успеха: двойной тап — та же покупка. */
export function useBuyShaman() {
  const t = useT();
  const qc = useQueryClient();
  const op = useRef<string | null>(null);
  return useMutation({
    mutationFn: (expect?: ShamanPrice) => {
      op.current ??= newOpId();
      return buyShaman({ data: { opId: op.current, expect } });
    },
    onSuccess: () => {
      op.current = null;
      toast.success(t("shaman.bought_toast"));
    },
    onError: (e: unknown) => toast.error(humanError(e)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: SHAMAN_HUT_VIEW_KEY });
      void qc.invalidateQueries({ queryKey: RESOURCES_KEY, refetchType: "all" });
    },
  });
}

/** Шаман из хижины — в рюкзак выбранного героя (дальше — охрана шахты). */
export function useTakeShaman() {
  const t = useT();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => takeShamanToBackpack(),
    onSuccess: () => toast.success(t("shaman.taken_toast")),
    onError: (e: unknown) => toast.error(humanError(e)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: SHAMAN_HUT_VIEW_KEY });
      void qc.invalidateQueries({ queryKey: ["my-hero-backpack"], refetchType: "all" });
    },
  });
}
