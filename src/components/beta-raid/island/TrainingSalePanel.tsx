// Сдача лишних тренировочных фишек за энергию (§8.114 п. 7) — строка над витриной любой
// лавки острова новичка. Нечего сдавать — строки нет.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { serverErrorText } from "@/lib/serverErrorText";
import { getTrainingSale, sellTrainingChips } from "@/server/api/beta-raid/island/training-sale";
import { QtyStepper } from "../market/QtyStepper";
import { useRaidMapId } from "../useEnergyMult";

export const TRAINING_SALE_KEY = ["island-training-sale"] as const;

export function TrainingSalePanel() {
  const t = useT();
  const qc = useQueryClient();
  const island = isIslandMapId(useRaidMapId());
  const q = useQuery({
    queryKey: TRAINING_SALE_KEY,
    queryFn: () => getTrainingSale(),
    enabled: island,
  });
  const [count, setCount] = useState(1);
  const sell = useMutation({
    mutationFn: (n: number) => sellTrainingChips({ data: { count: n } }),
    onSuccess: (r) => {
      toast.success(t("island.training_sale_done", { n: r.sold, e: r.energy }));
      setCount(1);
      void qc.invalidateQueries({ queryKey: TRAINING_SALE_KEY });
      void qc.invalidateQueries({ queryKey: ENERGY_KEY });
      void qc.invalidateQueries({
        predicate: (x) => /chip|hallway|squad/i.test(String(x.queryKey[0] ?? "")),
      });
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });
  const v = q.data;
  if (!island || !v?.here || v.sellable <= 0) return null;
  const n = Math.min(count, v.sellable);
  return (
    <div className="raid-market-training flex items-center gap-2 px-3 py-2 text-xs">
      <span className="min-w-0 flex-1 truncate">
        {t("island.training_sale", { n: v.sellable })}
      </span>
      <QtyStepper
        value={n}
        max={v.sellable}
        min={1}
        compact
        disabled={sell.isPending}
        onChange={setCount}
      />
      <button
        type="button"
        data-game-button="primary"
        className="shrink-0 rounded-lg px-3 py-1.5 disabled:opacity-50"
        disabled={sell.isPending}
        onClick={() => sell.mutate(n)}
      >
        {t("island.training_sale_btn", { e: v.steps[n - 1] ?? 0 })}
      </button>
    </div>
  );
}
