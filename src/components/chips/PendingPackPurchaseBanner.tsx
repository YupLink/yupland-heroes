import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { purchaseChipPackViaDarai } from "@/server/api/chips-pack";
import { humanError } from "@/lib/humanError";

export function PendingPackPurchaseBanner() {
  const t = useT();
  const qc = useQueryClient();
  const [pending, setPending] = useState<{
    packId: string;
    txHash: string;
    priceDarai: number | null;
    count?: number;
    at: number;
  } | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("pending_pack_purchase");
      if (raw) setPending(JSON.parse(raw));
    } catch {
      /* битый JSON — игнорим */
    }
  }, []);

  const retry = useMutation({
    mutationFn: async () => {
      if (!pending) throw new Error("Нет данных");
      return purchaseChipPackViaDarai({
        data: {
          packId: pending.packId,
          txHash: pending.txHash,
          count: pending.count ?? 1,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("chips.pack_credited"));
      try {
        window.localStorage.removeItem("pending_pack_purchase");
      } catch {
        /* ignore */
      }
      setPending(null);
      qc.invalidateQueries({ queryKey: ["my-chip-packs"] });
      qc.invalidateQueries({ queryKey: ["chip-packs-public"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (!pending) return null;
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-300 transition hover:bg-amber-400/20"
      >
        ⚠ <span>{t("chips.uncredited_purchase")}</span>
        <span className="text-amber-300/70">· {t("chips.show_again")}</span>
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs">
      <div className="mb-2 font-semibold text-amber-300">{t("chips.uncredited_purchase")}</div>
      <div className="mb-2 text-amber-200/80">{t("chips.uncredited_purchase_desc")}</div>
      <div className="mb-2 font-mono text-[10px] text-amber-200/60">
        {pending.txHash.slice(0, 20)}…
        {pending.priceDarai ? ` · ${pending.priceDarai.toLocaleString("ru-RU")} DARAI` : ""}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
          className="flex-1 rounded-lg bg-amber-400 px-3 py-2 text-[11px] font-bold text-amber-950"
        >
          {retry.isPending ? t("chips.crediting") : t("chips.retry")}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded-lg border border-amber-400/30 px-3 py-2 text-[11px] text-amber-300"
        >
          {t("chips.hide")}
        </button>
      </div>
    </div>
  );
}
