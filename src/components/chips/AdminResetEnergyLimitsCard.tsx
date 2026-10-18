// Разовый сброс дневных лимитов покупки энергии ВСЕМ игрокам. Живёт рядом с
// «Начислить себе энергию» — тот же админский подраздел «Купить энергию».
//
// Сбрасывает две механики одной пачкой (см. adminResetEnergyDailyLimits):
//   * магазин — energy_pack_purchases за сегодняшний UTC-день сдвигаются на
//     вчерашние 23:59:59, дневной счётчик перестаёт их считать.
//   * «+10 за 50 лайков» — settings(key like 'energy_like_daily:%') стираются.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getSession } from "@/server/api/user-auth";
import { adminResetEnergyDailyLimits } from "@/server/api/energyPacks";
import { humanError } from "@/lib/humanError";

export function AdminResetEnergyLimitsCard() {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const reset = useMutation({
    mutationFn: () => adminResetEnergyDailyLimits(),
    onSuccess: (r) => {
      toast.success(
        `Сброшено дневных лимитов: паков ${r.packReset}, лайк-подарков ${r.likeReset}`,
      );
      // Оффер «+10 за лайки» и витрина энерго-паков перечитаются — иначе кнопка
      // «Куплено сегодня» осталась бы серой до перезагрузки.
      qc.invalidateQueries({ queryKey: ["energy-like-offer"] });
      qc.invalidateQueries({ queryKey: ["energy-packs-public"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  if (!session.data?.isAdmin) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/5 p-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
        <RotateCcw className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">Сбросить лимиты всем</div>
        <div className="text-[11px] text-muted-foreground">
          Все паки и «+10 за лайки» — на всех игроков · без отката
        </div>
      </div>
      <button
        onClick={() => {
          if (window.confirm("Сбросить дневные лимиты покупки энергии ВСЕМ игрокам?")) {
            reset.mutate();
          }
        }}
        disabled={reset.isPending}
        className="shrink-0 rounded-xl bg-amber-500/90 px-4 py-2 text-xs font-bold text-amber-950 transition enabled:hover:scale-[1.02] disabled:opacity-40"
      >
        {reset.isPending ? "…" : "Сбросить"}
      </button>
    </div>
  );
}
