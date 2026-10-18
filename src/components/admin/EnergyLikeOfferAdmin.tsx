// АДМИН: «энергия за лайки» — сколько энергии за покупку, вкл/выкл и лестница
// цен в лайках (сумма «раз в день» = лимит покупок за сутки).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ThumbsUp, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";
import { stepsTotal } from "@/lib/energySteps";
import type { EnergyLikeOffer } from "@/lib/energyLikeOffer";
import { adminGetEnergyLikeOffer, adminSetEnergyLikeOffer } from "@/api";
import { StepLadderRow } from "./StepLadderRow";

export function EnergyLikeOfferAdmin() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "energy-like-offer"],
    queryFn: () => adminGetEnergyLikeOffer(),
  });
  // Правки копятся в черновике; null — показываем сохранённое.
  const [draft, setDraft] = useState<EnergyLikeOffer | null>(null);
  const cur = draft ?? q.data ?? null;

  const save = useMutation({
    mutationFn: (d: EnergyLikeOffer) => adminSetEnergyLikeOffer({ data: d }),
    onSuccess: (saved) => {
      toast.success("Сохранено");
      qc.setQueryData(["admin", "energy-like-offer"], saved);
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin", "energy-like-offer"] });
      qc.invalidateQueries({ queryKey: ["energy-like-offer"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (!cur) {
    if (q.isError) {
      return (
        <button
          type="button"
          onClick={() => q.refetch()}
          className="w-full rounded-2xl border border-destructive/40 bg-card p-3.5 text-left text-xs text-destructive"
        >
          Энергия за лайки: {humanError(q.error)} — повторить
        </button>
      );
    }
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />;
  }
  const edit = (p: Partial<EnergyLikeOffer>) => setDraft({ ...cur, ...p });

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
            <ThumbsUp className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-bold">Энергия за лайки</div>
            <div className="text-[11px] text-muted-foreground">
              {stepsTotal(cur.steps)} покупок/день
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => edit({ enabled: !cur.enabled })}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition",
            cur.enabled
              ? "bg-success/15 text-success"
              : "border border-border bg-secondary text-muted-foreground",
          )}
        >
          {cur.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {cur.enabled ? "Включено" : "Выключено"}
        </button>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
          Энергия за покупку
        </label>
        <input
          type="number"
          min={1}
          value={cur.amount}
          onChange={(e) => edit({ amount: Math.floor(Number(e.target.value) || 0) })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base font-bold"
        />
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Лестница цен в лайках
        </div>
        <StepLadderRow steps={cur.steps} onChange={(steps) => edit({ steps })} />
      </div>

      {draft && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="flex-1 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate(draft)}
            className="flex-1 rounded-xl gradient-gold py-2 text-xs font-bold text-gold-foreground shadow-gold disabled:opacity-50"
          >
            {save.isPending ? "…" : "Сохранить"}
          </button>
        </div>
      )}
    </div>
  );
}
