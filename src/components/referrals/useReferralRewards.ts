// Незабранные награды за друзей (бонус-боксы за вехи, 10 % USDT с подписок
// друзей): список в «Друзьях» и точка на входе в «Друзья» и в профиль.
// Один ключ на всё — клейм инвалидирует его, и точка гаснет без перезагрузки.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { claimReferralReward, getMyReferralRewards } from "@/server/api/referral-rewards";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { humanError } from "@/lib/humanError";

export const REF_REWARDS_KEY = ["referral-rewards"] as const;

/** Что ещё обновить после клейма: бокс — в паках, USDT — на счёте. */
const TOUCHED: ReadonlyArray<readonly string[]> = [
  REF_REWARDS_KEY,
  ["my-mystic-packs"],
  ["my-chip-packs"],
  ACC_BALANCES_KEY,
  ["acc-history"],
];

export function useReferralRewards() {
  return useQuery({
    queryKey: REF_REWARDS_KEY,
    queryFn: () => getMyReferralRewards(),
    staleTime: 60_000,
    // Новый бокс появляется, когда друг покупает пак, — точка должна загореться сама.
    refetchInterval: 5 * 60_000,
  });
}

/** Сколько наград ждёт игрока (0 — точки нет). */
export function useReferralRewardsPending(): number {
  const q = useReferralRewards();
  return (q.data?.boxes.length ?? 0) + (q.data?.usdt.length ?? 0);
}

const ERRORS: Record<string, [string, string]> = {
  "refrw.not_found": ["Награда не найдена", "Reward not found"],
  "refrw.no_account": ["Не найден аккаунт — войди заново", "Account not found — sign in again"],
  "refrw.retry": ["Не получилось забрать — попробуй ещё раз", "Could not claim — try again"],
};

export function refRewardError(e: Error, ru: boolean): string {
  const known = ERRORS[e.message];
  return known ? known[ru ? 0 : 1] : humanError(e);
}

export function useClaimReferralReward(ru: boolean) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => claimReferralReward({ data: { id } }),
    onSuccess: (r) => {
      if (r.already) toast.info(ru ? "Уже забрано" : "Already claimed");
      else if (r.kind === "box")
        toast.success(ru ? "Bonus Box — в твоих паках" : "Bonus Box added to your packs");
      else toast.success(ru ? `+${r.amount} USDT на счёт` : `+${r.amount} USDT to your account`);
      for (const key of TOUCHED) void qc.invalidateQueries({ queryKey: key, refetchType: "all" });
    },
    onError: (e: Error) => {
      toast.error(refRewardError(e, ru));
      void qc.invalidateQueries({ queryKey: REF_REWARDS_KEY, refetchType: "all" });
    },
  });
}
