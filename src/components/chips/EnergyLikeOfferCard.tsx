import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { getEnergyLikeOffer, buyEnergyForLikes } from "@/server/api/chips-stake";
import { humanError } from "@/lib/humanError";

export function EnergyLikeOfferCard() {
  const t = useT();
  const qc = useQueryClient();
  const offer = useQuery({
    queryKey: ["energy-like-offer"],
    queryFn: () => getEnergyLikeOffer(),
  });
  const o = offer.data;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["my-energy"] });
    qc.invalidateQueries({ queryKey: ["my-like-balance"] });
    qc.invalidateQueries({ queryKey: ["energy-like-offer"] });
  };
  const buy = useMutation({
    // Сервер спишет ровно показанную цену или откажет, если ступень сменилась.
    mutationFn: (expectedPrice: number) => buyEnergyForLikes({ data: { expectedPrice } }),
    onSuccess: (r) => {
      toast.success(
        t("chips.energy_bought", {
          n: r.amount ?? o?.amount ?? 0,
          now: r.energyNow,
          likesLeft: r.likesLeft,
        }),
      );
      refresh();
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      refresh();
    },
  });
  if (!o?.visible) return null;
  // Кэш ответа живёт сутки (§11.13в): в старом нет used/total — это «раз в день».
  const cached: { used?: number; total?: number } = o;
  const total = Number(cached.total ?? 1) || 1;
  const used = Number(cached.used ?? (o.boughtToday ? 1 : 0)) || 0;
  const left = Math.max(0, total - used);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-rose-400/40 bg-rose-500/5 p-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
        <Zap className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{t("chips.plus_energy", { n: o.amount })}</div>
        <div className="text-[11px] text-muted-foreground">
          {total > 1
            ? t("chips.likes_left_today", { n: o.priceLikes, left, total })
            : t("chips.likes_once_a_day", { n: o.priceLikes })}
        </div>
      </div>
      <button
        onClick={() => buy.mutate(o.priceLikes)}
        disabled={o.boughtToday || buy.isPending}
        className="shrink-0 rounded-xl gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground shadow-gold transition enabled:hover:scale-[1.02] disabled:opacity-40"
      >
        {buy.isPending ? "…" : o.boughtToday ? t("chips.bought_today") : t("chips.buy")}
      </button>
    </div>
  );
}
