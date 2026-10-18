// Выдача энергии тестерам: одно поле, кнопка «всем» и кнопка на каждой строке.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { adminGrantTesterEnergy, adminTestersEnergy } from "@/server/api/testers-energy";
import { humanError } from "@/lib/humanError";

export function TesterEnergyPanel({ count }: { count: number }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("30");
  const value = Number(amount.replace(",", "."));
  const valid = Number.isFinite(value) && value > 0;

  const energyQ = useQuery({
    queryKey: ["admin-testers-energy"],
    queryFn: () => adminTestersEnergy(),
  });

  const grant = useMutation({
    mutationFn: (wallet?: string) =>
      adminGrantTesterEnergy({ data: wallet ? { amount: value, wallet } : { amount: value } }),
    onSuccess: (r) => {
      toast.success(
        r.granted === 1
          ? `Начислено ${r.amount} энергии`
          : `Начислено ${r.amount} энергии — ${r.granted} тестерам`,
      );
      if (r.failed.length > 0) toast.error(`Не прошло: ${r.failed.join(", ")}`);
      qc.invalidateQueries({ queryKey: ["admin-testers-energy"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const busy = grant.isPending;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <Zap className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold" />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="сколько энергии"
            className="w-full min-w-[140px] rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm tabular-nums"
          />
        </div>
        <button
          onClick={() => valid && grant.mutate(undefined)}
          disabled={busy || !valid || count === 0}
          className="inline-flex items-center gap-1.5 rounded-xl gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          {busy && !grant.variables ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Начислить всем ({count})
        </button>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border">
        {energyQ.isLoading && (
          <div className="flex justify-center p-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {energyQ.data?.rows.map((row) => (
          <div key={row.wallet} className="flex items-center gap-2 p-3">
            <div className="min-w-0 flex-1 truncate font-mono text-sm">{row.wallet}</div>
            <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-gold" />
              {row.energy == null ? "—" : Math.round(row.energy)}
            </span>
            <button
              onClick={() => valid && grant.mutate(row.wallet)}
              disabled={busy || !valid}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition hover:border-gold/50 disabled:opacity-50"
            >
              {busy && grant.variables === row.wallet ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Выдать"
              )}
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Энергия ложится поверх лимита и не сгорает от регенерации.
      </p>
    </div>
  );
}
