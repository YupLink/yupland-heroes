// Данные окна «Промокоды»: список и три действия. Флаг меняем сразу в кэше
// (переключатель не ждёт сервера), отказ — откат и тост.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import type { PromoCodeAdmin } from "@/lib/promo/promoTypes";
import {
  adminCreatePromo,
  adminDeletePromo,
  adminListPromos,
  adminTogglePromo,
} from "@/server/api/promo/promo-admin";
import type { draftToInput } from "./promoDraft";

export const PROMO_ADMIN_KEY = ["admin-promos"] as const;

type PromoPage = { rows: PromoCodeAdmin[]; more: boolean };

/** Первые limit кодов; «Показать ещё» растит limit, прежний список не мигает. */
export function usePromoList(limit: number) {
  return useQuery({
    queryKey: [...PROMO_ADMIN_KEY, limit],
    queryFn: () => adminListPromos({ data: { limit } }),
    placeholderData: keepPreviousData,
  });
}

export function usePromoCreate(onCreated: (code: string) => void) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: (input: ReturnType<typeof draftToInput>) => adminCreatePromo({ data: input }),
    onSuccess: (res) => {
      toast.success(t("promo.adm.created", { code: res.code }), { position: "top-center" });
      void qc.invalidateQueries({ queryKey: PROMO_ADMIN_KEY });
      onCreated(res.code);
    },
    onError: (e: Error) => toast.error(humanError(e), { position: "top-center" }),
  });
}

export function usePromoToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; active: boolean }) => adminTogglePromo({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: PROMO_ADMIN_KEY });
      const prev = qc.getQueriesData<PromoPage>({ queryKey: PROMO_ADMIN_KEY });
      qc.setQueriesData<PromoPage>({ queryKey: PROMO_ADMIN_KEY }, (page) =>
        page
          ? {
              ...page,
              rows: page.rows.map((r) => (r.id === v.id ? { ...r, active: v.active } : r)),
            }
          : page,
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      for (const [key, page] of ctx?.prev ?? []) qc.setQueryData(key, page);
      toast.error(humanError(e), { position: "top-center" });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: PROMO_ADMIN_KEY }),
  });
}

export function usePromoDelete() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: (id: string) => adminDeletePromo({ data: { id } }),
    onSuccess: (res) => {
      toast.success(t(res.deleted ? "promo.adm.deleted" : "promo.adm.deactivated"), {
        position: "top-center",
      });
      void qc.invalidateQueries({ queryKey: PROMO_ADMIN_KEY });
    },
    onError: (e: Error) => toast.error(humanError(e), { position: "top-center" }),
  });
}
