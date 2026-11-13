import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gift, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { claimBossRewards } from "@/server/api/boss";

export function BossRewards({ myRewardsCount }: { myRewardsCount: number }) {
  const t = useT();
  const qc = useQueryClient();

  const claim = useMutation({
    mutationFn: () => claimBossRewards(),
    onSuccess: (r) => {
      const parts = Object.entries(r.summary).map(([k, v]) => `${k}: ${v}`).join(", ");
      toast.success(t("boss.rewards_received", { parts: parts || r.claimed }));
      qc.refetchQueries({ queryKey: ["boss-active"] });
      qc.invalidateQueries({ queryKey: ["my-energy"] });
      qc.invalidateQueries({ queryKey: ["my-yupland-status"] });
      qc.invalidateQueries({ queryKey: ["yupland-status"] });
      qc.invalidateQueries({ queryKey: ["my-resources"] });
      qc.invalidateQueries({ queryKey: ["my-like-balance"] });
      qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  if (myRewardsCount <= 0) return null;

  return (
    <button onClick={() => claim.mutate()} disabled={claim.isPending}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/50 bg-gold/10 py-3 text-sm font-bold text-gold transition enabled:hover:bg-gold/20 enabled:hover:scale-[1.01] disabled:opacity-50 animate-pulse-gold">
      <Gift className="h-4 w-4" />
      {claim.isPending ? t("boss.claiming") : t("boss.claim_boss_reward", { n: myRewardsCount })}
    </button>
  );
}
