import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { purchaseChipPackViaDarai, reconcileMyDaraiPacks } from "@/server/api/chips-pack";
import { humanError } from "@/lib/humanError";

type PublicPack = { id: string; name: string; priceDarai: number | null };

export function RecoverPackPurchase({ packs }: { packs: PublicPack[] }) {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [packId, setPackId] = useState<string>("");

  const recover = useMutation({
    mutationFn: () =>
      purchaseChipPackViaDarai({
        data: { packId, txHash: txHash.trim(), count: 1 },
      }),
    onSuccess: () => {
      toast.success(t("chips.pack_credited"));
      setOpen(false);
      setTxHash("");
      setPackId("");
      qc.invalidateQueries({ queryKey: ["my-chip-packs"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const autoCheck = useMutation({
    mutationFn: () => reconcileMyDaraiPacks(),
    onSuccess: (r) => {
      if (r?.recovered) {
        toast.success(t("chips.pack_auto_recovered", { n: r.recovered }));
        qc.invalidateQueries({ queryKey: ["my-chip-packs"] });
        qc.invalidateQueries({ queryKey: ["chip-packs-public"] });
        setOpen(false);
      } else {
        toast(t("chips.pack_auto_none"));
        setOpen(true);
      }
    },
    onError: () => setOpen(true),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => autoCheck.mutate()}
        disabled={autoCheck.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-secondary/10 px-3 py-2 text-[11px] text-muted-foreground hover:bg-secondary/20 disabled:opacity-60"
      >
        {autoCheck.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        {autoCheck.isPending ? t("chips.pack_auto_checking") : t("chips.money_gone_no_pack")}
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs">
      <div className="mb-2 font-semibold text-amber-300">{t("chips.recover_pack_purchase")}</div>
      <div className="mb-2 text-amber-200/70">{t("chips.recover_pack_desc")}</div>
      <label className="block">
        <span className="text-[10px] text-muted-foreground">{t("chips.pack")}</span>
        <select
          value={packId}
          onChange={(e) => setPackId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
        >
          <option value="">{t("chips.select_pack_option")}</option>
          {packs
            .filter((p) => p.priceDarai != null)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.priceDarai?.toLocaleString("ru-RU")} DARAI
              </option>
            ))}
        </select>
      </label>
      <label className="mt-2 block">
        <span className="text-[10px] text-muted-foreground">{t("chips.tx_hash_label")}</span>
        <input
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder={t("chips.tx_hash_placeholder")}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
        />
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => recover.mutate()}
          disabled={recover.isPending || !packId || txHash.trim().length < 20}
          className="flex-1 rounded-lg bg-amber-400 px-3 py-2 text-[11px] font-bold text-amber-950 disabled:opacity-50"
        >
          {recover.isPending ? t("chips.crediting") : t("chips.credit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-3 py-2 text-[11px] text-muted-foreground"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
