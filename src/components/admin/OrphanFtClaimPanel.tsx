// YUPLINK · Подбор «осиротевшего» FT-платежа за билеты.
//
// Сценарий: юзер подписал ft_transfer DARAI на наш сервисный коша,
// но фронт не дошёл до purchaseTicketsViaToken (закрыл вкладку,
// упала сеть). Tx на чейне есть, билеты не зачислились. Этот блок
// принимает tx_hash + offerId + sender wallet, верифицирует через RPC
// и зачисляет билеты тому же sender'у.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LifeBuoy, Check, Hash, Wallet, Tag, Ticket } from "lucide-react";
import { adminClaimOrphanFtPurchase } from "@/server/api/user-shop";
import { humanError } from "@/lib/humanError";

export function OrphanFtClaimPanel() {
  const qc = useQueryClient();
  const [txHash, setTxHash] = useState("");
  const [offerId, setOfferId] = useState("");
  const [sender, setSender] = useState("");
  const [quantity, setQuantity] = useState("1");

  const claim = useMutation({
    mutationFn: () =>
      adminClaimOrphanFtPurchase({
        data: {
          txHash: txHash.trim(),
          offerId: offerId.trim(),
          senderWallet: sender.trim(),
          quantity: Math.max(1, Number(quantity) || 1),
        },
      }),
    onSuccess: (r) => {
      toast.success(
        (r.alreadyCredited ? "Уже было зачислено: " : "Зачислено: ") +
          `+${r.ticketsAdded} 🎫 на ${r.wallet}`
      );
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-rose-300">
        <LifeBuoy className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">Подобрать «потерянную» покупку</span>
      </div>
      <div
        className="mb-3 text-[11px] text-muted-foreground"
        title="Оплата уже на чейне, но фронт не дозачислил билеты. Проверим on-chain и начислим. Повторная отправка с тем же хэшем безопасна — вернёт «уже было». Поля бери из транзакции на nearblocks.io или скрина юзера."
      >
        Оплата прошла, билеты не зачислились — заполни поля и зачти.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Hash className="h-3 w-3 shrink-0" />
            Хэш транзакции
          </span>
          <input
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="напр. 5xQ…абвг"
            title="Хэш транзакции с nearblocks.io или скрина оплаты юзера."
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-rose-500/50"
          />
        </label>
        <label className="block min-w-0">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Wallet className="h-3 w-3 shrink-0" />
            Отправитель
          </span>
          <input
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="напр. 123456789.tg"
            title="Кошелёк, с которого платили — ему и зачислим билеты."
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-rose-500/50"
          />
        </label>
        <label className="block min-w-0">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Tag className="h-3 w-3 shrink-0" />
            ID оффера
          </span>
          <input
            value={offerId}
            onChange={(e) => setOfferId(e.target.value)}
            placeholder="ts_…"
            title="ID оффера билета из memo транзакции или лога покупки."
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-rose-500/50"
          />
        </label>
        <label className="block min-w-0">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Ticket className="h-3 w-3 shrink-0" />
            Кол-во билетов
          </span>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="обычно 1"
            title="Сумма перевода ÷ цена оффера. Обычно 1."
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-rose-500/50"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={claim.isPending || !txHash || !offerId || !sender}
        onClick={() => claim.mutate()}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-rose-500 px-5 py-2 text-sm font-bold text-white shadow-[0_0_18px_rgba(244,63,94,0.45)] transition hover:bg-rose-400 disabled:opacity-50"
      >
        {claim.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        Зачесть покупку
      </button>
    </div>
  );
}
