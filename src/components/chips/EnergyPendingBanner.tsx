// Плашка «оплата зачисляется» + автозачёт.
//
// Пока оплата не превратилась в энергию, покупка закрыта (см. energyPending),
// а мы каждые несколько секунд сами пробуем её закрыть — вместо ожидания
// получаса до крон-догона.
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { settleMyEnergyPayments } from "@/server/api/energy-packs-pending";
import { PENDING_KEY, readPendingPay, clearPendingPay } from "./energyPending";

/** Как часто добиваем зачёт, пока оплата висит. */
const RETRY_MS = 6_000;

export function EnergyPendingBanner() {
  const qc = useQueryClient();
  const pending = useQuery({
    queryKey: PENDING_KEY,
    queryFn: () => readPendingPay(),
    staleTime: Infinity,
  });
  const pay = pending.data;

  useEffect(() => {
    if (!pay) return;
    let stop = false;
    const tick = async () => {
      const res = await settleMyEnergyPayments().catch(() => null);
      if (stop) return;
      // Оплата закрыта: либо мы её только что зачли, либо это сделал крон и
      // неучтённых переводов уже не осталось.
      if (res && (res.settled > 0 || res.pending == null)) {
        clearPendingPay(qc);
        if (res.settled > 0 && res.energy > 0) toast.success(`+${res.energy} энергии`);
        qc.invalidateQueries({ queryKey: ["my-energy"] });
        qc.invalidateQueries({ queryKey: ["energy-packs-public"] });
      }
    };
    void tick();
    const id = setInterval(tick, RETRY_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [pay, qc]);

  if (!pay) return null;

  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" />
      <div className="min-w-0">
        <div className="font-semibold text-amber-300">Зачисляем оплату…</div>
        <div className="text-[11px] text-muted-foreground">
          Оплата {pay.label} прошла — энергия появится через несколько секунд. Второй раз платить не
          нужно.
        </div>
      </div>
    </div>
  );
}
