import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { getSession } from "@/server/api/user-auth";
import { adminGrantEnergy } from "@/server/api/chips-stake";
import { humanError } from "@/lib/humanError";

export function AdminEnergyGrantCard() {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const [amount, setAmount] = useState("100");
  const grant = useMutation({
    mutationFn: () => adminGrantEnergy({ data: { amount: Math.trunc(Number(amount)) } }),
    onSuccess: (r) => {
      toast.success(`+${r.added} энергии (админ-тест)`);
      qc.invalidateQueries({ queryKey: ["my-energy"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  if (!session.data?.isAdmin) return null;
  const n = Math.trunc(Number(amount));
  const valid = Number.isFinite(n) && n > 0;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/5 p-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
        <Zap className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">Начислить себе энергию</div>
        <div className="text-[11px] text-muted-foreground">Только для админа · тест</div>
      </div>
      <input
        type="number"
        min={1}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-16 shrink-0 rounded-lg border border-border bg-secondary/40 px-2 py-2 text-center text-sm font-bold outline-none focus:border-emerald-400/60"
      />
      <button
        onClick={() => grant.mutate()}
        disabled={!valid || grant.isPending}
        className="shrink-0 rounded-xl bg-emerald-500/90 px-4 py-2 text-xs font-bold text-emerald-950 transition enabled:hover:scale-[1.02] disabled:opacity-40"
      >
        {grant.isPending ? "…" : "Начислить"}
      </button>
    </div>
  );
}
