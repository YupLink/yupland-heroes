import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listEnergyPacksPublic, recoverMyEnergyPurchase } from "@/server/api/energyPacks";
import { humanError } from "@/lib/humanError";

export function RecoverEnergyPurchase() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["energy-packs-public"],
    queryFn: () => listEnergyPacksPublic(),
  });
  // Восстановить можно всё, что оплачивается on-chain: DARAI, старая цена в
  // токене и любая валюта из лестницы (её раньше тут вообще не было видно).
  const packs = (q.data?.packs ?? []).filter(
    (p) =>
      p.priceDarai != null ||
      p.token != null ||
      (p.offers ?? []).some((o) => o.kind === "token" || o.kind === "darai"),
  );
  const [open, setOpen] = useState(false);
  const [packId, setPackId] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  // Валюты выбранного пака: старое одиночное поле + все из лестницы.
  const chosen = packs.find((p) => p.id === packId);
  const tokenChoices = Array.from(
    new Set(
      [chosen?.token?.symbol, ...(chosen?.offers ?? []).map((o) => o.symbol ?? undefined)].filter(
        (x): x is string => !!x,
      ),
    ),
  );
  const [txHash, setTxHash] = useState("");
  const recover = useMutation({
    mutationFn: () =>
      recoverMyEnergyPurchase({
        data: { packId, txHash: txHash.trim(), tokenSymbol: tokenSymbol || undefined },
      }),
    onSuccess: (r) => {
      toast.success(r.already ? "Этот платёж уже начислен" : `Зачтено: +${r.energyAdded}⚡`);
      setOpen(false);
      setTxHash("");
      setPackId("");
      qc.invalidateQueries({ queryKey: ["my-energy"] });
      qc.invalidateQueries({ queryKey: ["yupland-status"] });
      qc.invalidateQueries({ queryKey: ["energy-packs-public"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  if (packs.length === 0) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-secondary/10 px-3 py-2 text-[11px] text-muted-foreground transition hover:bg-secondary/20"
      >
        Оплатил, а энергия не пришла? Восстановить
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs">
      <div className="mb-2 font-semibold text-amber-300">Восстановить энергию</div>
      <div className="mb-2 text-amber-200/70">
        Вставь hash транзакции оплаты (ft_transfer на darai_gdrop.near) и выбери пак, который
        покупал. Если сумма и адреса совпадут — энергия придёт.
      </div>
      <label className="block">
        <span className="text-[10px] text-muted-foreground">Пак</span>
        <select
          value={packId}
          onChange={(e) => setPackId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
        >
          <option value="">— выбери пак —</option>
          {packs.map((p) => (
            <option key={p.id} value={p.id}>
              +{p.amount}⚡
            </option>
          ))}
        </select>
      </label>

      {/* Чем платили: у пака с лестницей валют без этого не сойдётся сумма. */}
      {tokenChoices.length > 0 && (
        <label className="mt-2 block">
          <span className="text-[10px] text-muted-foreground">чем платил</span>
          <select
            value={tokenSymbol}
            onChange={(e) => setTokenSymbol(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
          >
            <option value="">$DARAI</option>
            {tokenChoices.map((sym) => (
              <option key={sym} value={sym}>
                {sym}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="mt-2 block">
        <span className="text-[10px] text-muted-foreground">tx hash</span>
        <input
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder="напр. 8KqLm…"
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
          {recover.isPending ? "Зачитываю…" : "Зачесть"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-3 py-2 text-[11px] text-muted-foreground"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
