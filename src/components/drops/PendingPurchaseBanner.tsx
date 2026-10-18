import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { purchaseTicketsViaToken } from "@/server/api/user-shop";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";

export function PendingPurchaseBanner() {
  const t = useT();
  const qc = useQueryClient();
  const [pending, setPending] = useState<{
    offerId: string;
    txHash: string;
    quantity: number;
    paymentToken: string | null;
    at: number;
  } | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("pending_ticket_purchase");
      if (raw) setPending(JSON.parse(raw));
    } catch {
      /* битый JSON — игнорим */
    }
  }, []);

  const retry = useMutation({
    mutationFn: async () => {
      if (!pending) throw new Error("Нет данных");
      return purchaseTicketsViaToken({
        data: {
          offerId: pending.offerId,
          txHash: pending.txHash,
          quantity: pending.quantity,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.alreadyCredited
          ? t("mynfts.toast_already_credited", { n: res.ticketsAdded })
          : t("mynfts.toast_tickets_added_token", {
              n: res.ticketsAdded,
              a: res.paymentAmount,
              token: res.paymentToken,
            })
      );
      try {
        window.localStorage.removeItem("pending_ticket_purchase");
      } catch {
        /* ignore */
      }
      setPending(null);
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      qc.invalidateQueries({ queryKey: ["my-nfts"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const dismiss = () => {
    try {
      window.localStorage.removeItem("pending_ticket_purchase");
    } catch {
      /* ignore */
    }
    setPending(null);
  };

  if (!pending) return null;
  const minutesAgo = Math.max(
    0,
    Math.round((Date.now() - pending.at) / 60_000)
  );
  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs">
      <div className="mb-1 font-semibold text-amber-200">
        {t("mynfts.purchase_not_credited")}
      </div>
      <p className="text-muted-foreground">
        {t("mynfts.purchase_not_credited_desc", {
          ago:
            minutesAgo === 0
              ? t("mynfts.just_now")
              : t("mynfts.min_ago", { n: minutesAgo }),
          token: pending.paymentToken ? ` (${pending.paymentToken})` : "",
        })}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-background transition hover:scale-[1.02] disabled:opacity-50"
        >
          {retry.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("mynfts.credit_btn")}
        </button>
        <button
          type="button"
          onClick={dismiss}
          disabled={retry.isPending}
          className="rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
        >
          {t("mynfts.hide")}
        </button>
      </div>
    </div>
  );
}
