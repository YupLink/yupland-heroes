import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recoverMyTicketPurchase } from "@/server/api/user-shop";
import { toast } from "sonner";
import type { ShopOffer } from "./shop-shared";
import { humanError } from "@/lib/humanError";

export function RecoverTicketPurchase({ offers }: { offers: ShopOffer[] }) {
  const qc = useQueryClient();
  const tokenOffers = offers.filter((o) => o.paymentToken && o.priceToken);
  const [open, setOpen] = useState(false);
  const [offerId, setOfferId] = useState("");
  const [txHash, setTxHash] = useState("");
  const recover = useMutation({
    mutationFn: () =>
      recoverMyTicketPurchase({
        data: { offerId, txHash: txHash.trim(), quantity: 1 },
      }),
    onSuccess: (r) => {
      toast.success(
        r.alreadyCredited
          ? "Эта покупка уже начислена"
          : `Зачтено: +${r.ticketsAdded} билетов`
      );
      setOpen(false);
      setTxHash("");
      setOfferId("");
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  if (tokenOffers.length === 0) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-secondary/10 px-3 py-2 text-[11px] text-muted-foreground transition hover:bg-secondary/20"
      >
        Деньги ушли, а билеты не пришли? Восстановить
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs">
      <div className="mb-2 font-semibold text-amber-300">
        Восстановить покупку билетов
      </div>
      <div className="mb-2 text-amber-200/70">
        Введи hash транзакции ft_transfer на darai_gdrop.near и выбери оффер, за
        который платил. Если сумма и адреса совпадут — билеты придут.
      </div>
      <label className="block">
        <span className="text-[10px] text-muted-foreground">Оффер</span>
        <select
          value={offerId}
          onChange={(e) => setOfferId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
        >
          <option value="">— выбери оффер —</option>
          {tokenOffers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.tickets} билетов · {o.priceToken?.toLocaleString("ru-RU")}{" "}
              {o.paymentToken}
            </option>
          ))}
        </select>
      </label>
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
          disabled={recover.isPending || !offerId || txHash.trim().length < 20}
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
