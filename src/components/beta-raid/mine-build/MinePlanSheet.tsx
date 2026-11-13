// Мой чертёж шахты, герой на нём или рядом: «Разместить · ⚡N» — шахта встаёт
// за энергию и видна всем сразу; «Убрать чертёж» — чертежа нет. Порталом поверх
// всего, как окна сундуков.
//
// Ключ нажатия живёт до успеха (как у починки, useMineRepair): повтор после
// обрыва связи несёт тот же ключ — сервер узнаёт уже вставшую шахту, досылает
// её карте, вторую не ставит и второй раз энергию не берёт.
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { refreshAfterMinePlace } from "@/components/beta-raid/mine-place/minePlaceLive";
import { useLang, useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { serverErrorText } from "@/lib/serverErrorText";
import { blueprintLabel } from "@/lib/mineBlueprint";
import type { MinePlanView } from "@/lib/mineBuild";
import { placeMineBlueprint } from "@/server/api/beta-raid/mine-place/mine-place";
import { removeMinePlan } from "@/server/api/beta-raid/mine-place/mine-plan";
import { minePlanKey, setMinePlan } from "./mineBuildStore";

export function MinePlanSheet({
  plan,
  energy,
  onClose,
}: {
  plan: MinePlanView;
  /** Сколько энергии сейчас: не хватает — кнопка красным, решает всё равно сервер. */
  energy: number;
  onClose: () => void;
}) {
  const t = useT();
  const ru = useLang() !== "en";
  const qc = useQueryClient();
  const op = useRef<string | null>(null);
  const gone = () => {
    setMinePlan(null);
    qc.setQueryData(minePlanKey(plan.mapId), null);
  };
  const place = useMutation({
    mutationFn: () => {
      op.current ??= newOpId();
      return placeMineBlueprint({ data: { op: op.current, energy: plan.energy } });
    },
    onSuccess: (res) => {
      op.current = null;
      gone();
      toast.success(t("mineplace.placed"));
      refreshAfterMinePlace(qc, res);
      onClose();
    },
    onError: (e: Error) => {
      toast.error(serverErrorText(e, t));
      refreshAfterMinePlace(qc);
    },
  });
  const drop = useMutation({
    mutationFn: () => removeMinePlan(),
    onSuccess: () => {
      gone();
      onClose();
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });
  const busy = place.isPending || drop.isPending;
  const title = t("mineplace.plan_title", { name: blueprintLabel(plan.kind, ru) });
  const short = energy < plan.energy;

  if (typeof document === "undefined") return null;
  return (
    <ResourceActionDialog
      title={title}
      busy={busy}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[140] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      className="w-full max-w-xs rounded-t-2xl border border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:rounded-2xl sm:pb-4"
    >
      <h4 className="mb-3 text-center font-display text-sm font-bold">{title}</h4>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => place.mutate()}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-gold font-bold text-black disabled:opacity-60"
        >
          {place.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("mineplace.place_btn", { n: plan.energy })}
          <Zap className={`h-4 w-4 ${short ? "text-red-700" : ""}`} fill="currentColor" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => drop.mutate()}
          className="h-10 rounded-xl border border-border text-sm text-muted-foreground disabled:opacity-60"
        >
          {t("mineplace.remove_plan")}
        </button>
      </div>
    </ResourceActionDialog>
  );
}
