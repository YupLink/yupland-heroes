// Кнопка улучшения игрока за алмаз (lib/accountUpgrade): в окне фермы и в окне склада — одно и
// то же улучшение (+50 % на фермах и +1 личная ячейка). Купил в любом — кнопки нет в обоих. После покупки окна
// склада и фермы перечитываются сразу (новая ячейка и доля ×1,5 — без F5).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gem, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { FARM_UPGRADE_MULT, isUpgraded, type UpgradeKind } from "@/lib/accountUpgrade";
import { buyUpgrade, getMyUpgrades } from "@/server/api/beta-raid/account-upgrade";

export const UPGRADES_KEY = ["my-upgrades"] as const;

export function UpgradeOffer({ kind }: { kind: UpgradeKind }) {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: UPGRADES_KEY, queryFn: () => getMyUpgrades(), staleTime: 60_000 });
  const buy = useMutation({
    mutationFn: () => buyUpgrade({ data: { kind } }),
    onSuccess: () => {
      toast.success(t("upgrade.done"));
      for (const key of [UPGRADES_KEY, ["beta-warehouse"], ["beta-field"], ["my-harvest-fields"]])
        void qc.invalidateQueries({ queryKey: [...key] });
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });
  if (!q.data || isUpgraded(q.data.upgrades)) return null;
  const pct = Math.round((FARM_UPGRADE_MULT - 1) * 100);
  return (
    <button
      type="button"
      disabled={buy.isPending}
      onClick={() => buy.mutate()}
      className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-gold/60 px-3 py-2 text-xs font-semibold text-gold disabled:opacity-50"
    >
      {buy.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gem className="h-4 w-4" />}
      {t("upgrade.buy", { n: q.data.cost, pct })}
    </button>
  );
}
