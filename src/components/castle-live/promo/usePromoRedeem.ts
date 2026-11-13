// Ввод промокода в профиле: сначала новые коды, не нашёлся — коды на лайки.
//
// Шаг к старым кодам делает клиент: серверная ручка изнутри другой ручки не
// работает. После выдачи перечитываем всё, куда мог лечь приз: счёт,
// ресурсы, энергию, лайки, рюкзак, «Добычу», инвентарь.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { redeemPromo } from "@/server/api/promo/promo-redeem";
import { redeemLikePromocode } from "@/server/api/likes";
import {
  likesError,
  likesOutcome,
  newOpId,
  promoToastOf,
  type PromoOutcome,
} from "./promoView";

/** Что перечитать: промокод кладёт что угодно и куда угодно. */
const TOUCHED: string[][] = [
  ["acc-balances"],
  ["my-resources"],
  ["my-energy"],
  ["my-like-balance"],
  ["my-hero-backpack"],
  ["beta-raid-harvest"],
  ["my-game-items"],
  ["my-heroes"],
  ["my-chip-packs"],
  ["my-mystic-packs"],
  ["beta-raid-state"],
];

/** Новый код → карточка; нет среди новых — код на лайки (его отказы — ключами). */
export async function redeemAnyPromo(code: string): Promise<PromoOutcome> {
  const res = await redeemPromo({ data: { code, opId: newOpId() } });
  if (res.status === "ok") return { code: res.code, items: res.items };
  try {
    return likesOutcome(await redeemLikePromocode({ data: { code } }));
  } catch (e) {
    throw likesError(e);
  }
}

export function usePromoRedeem() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: (code: string) => redeemAnyPromo(code.trim()),
    onSuccess: (o) => {
      for (const key of TOUCHED) void qc.invalidateQueries({ queryKey: key, refetchType: "all" });
      const kind = promoToastOf(o);
      const opts = { position: "top-center" as const };
      if (kind === "nothing") toast(t("promo.nothing"), opts);
      else if (kind === "pending") toast.warning(t("promo.pending_toast"), opts);
      else toast.success(t("promo.got"), opts);
    },
  });
}
