import { useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { minesCreditedLine } from "@/lib/minesCreditedLine";
import { claimLostMine } from "@/server/api/beta-raid/mine-lost/mine-lost-claim";
import { refreshAfterCollect } from "./useHarvest";

/** Collect only this ledger entry; never substitute the collect-all action. */
export function CaptureCollectButton({ id, name }: { id: string; name: string }) {
  const t = useT();
  const qc = useQueryClient();
  const busy = useIsMutating() > 0;
  const mutation = useMutation({
    mutationKey: ["harvest-capture-collect"],
    mutationFn: () => claimLostMine({ data: { id } }),
    onSuccess: (res) => {
      refreshAfterCollect(qc);
      const line = minesCreditedLine(t, res.credited);
      if (line) toast.success(t("mine.collected_all_toast", { line }), { position: "top-center" });
      else toast.info(t("harvest.capture_unavailable"), { position: "top-center" });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  return <button className="harvest-capture-collect" type="button" disabled={busy}
    aria-label={t("harvest.collect_one_label", { name })} onClick={() => mutation.mutate()}>
    {t(mutation.isPending ? "harvest.collecting" : "harvest.collect_one")}
  </button>;
}
