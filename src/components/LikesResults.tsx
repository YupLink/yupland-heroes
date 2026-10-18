import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ThumbsUp, Plus, Loader2, X, Star } from "lucide-react";
import { buyLikePackage, listLikeShopOffers, myLikeBalance } from "@/server/api/likes";
import { buyLikesWithStars } from "@/server/api/likes-stars-pay";
import { useAccountEnabled, ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";

export function fmtLikes(x: number): string {
  const n = Number(x) || 0;
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

export function LikesChip() {
  const t = useT();
  const [shopOpen, setShopOpen] = useState(false);
  const bal = useQuery({ queryKey: ["my-like-balance"], queryFn: () => myLikeBalance(), staleTime: 30_000 });

  if (bal.isLoading) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-300">
        <ThumbsUp className="h-3 w-3" /><Loader2 className="h-3 w-3 animate-spin" />
      </span>
    );
  }
  if (!bal.data) return null;

  return (
    <>
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/10 py-1 pl-3 pr-1 text-xs font-medium text-rose-300">
        <ThumbsUp className="h-3 w-3" />
        {fmtLikes(bal.data.available)}
        <span className="text-rose-300/70">/{bal.data.maxPool}</span>
        <button onClick={() => setShopOpen(true)} title={t("likes.buy_likes_for_tickets")} className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-400/20 text-rose-300 transition hover:bg-rose-400/30">
          <Plus className="h-3 w-3" />
        </button>
      </span>
      <BuyLikesModal open={shopOpen} onClose={() => setShopOpen(false)} currentLikes={bal.data.available} />
    </>
  );
}

export function BuyLikesModal({
  open, onClose, currentLikes,
}: {
  open: boolean;
  onClose: () => void;
  currentLikes: number;
}) {
  const t = useT();
  const qc = useQueryClient();
  const offers = useQuery({ queryKey: ["like-shop-offers"], queryFn: () => listLikeShopOffers(), enabled: open });
  const [qtyByOffer, setQtyByOffer] = useState<Record<string, string>>({});
  const buy = useMutation({
    mutationFn: (args: { offerId: string; quantity: number }) => buyLikePackage({ data: args }),
    onSuccess: (res) => {
      toast.success(t("likes.bought_toast", { likes: res.likesAdded, tickets: res.ticketsSpent }));
      qc.invalidateQueries({ queryKey: ["my-like-balance"] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const accountOn = useAccountEnabled();
  const buyStars = useMutation({
    mutationFn: (args: { offerId: string; quantity: number }) => {
      const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
      const opId =
        typeof c?.randomUUID === "function"
          ? c.randomUUID().replace(/-/g, "").slice(0, 24)
          : `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      return buyLikesWithStars({ data: { ...args, opId } });
    },
    onSuccess: (res) => {
      toast.success(`+${res.likesAdded} 👍 · ${res.spentStars}★ со счёта`);
      qc.invalidateQueries({ queryKey: ["my-like-balance"] });
      qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
      onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (!open) return null;

  const baseRatio = (offers.data ?? []).slice().sort((a, b) => a.tickets - b.tickets)[0]?.ratio ?? 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <ThumbsUp className="h-5 w-5 text-rose-400" />
            <span className="font-display text-lg font-bold">{t("likes.buy_likes")}</span>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 max-h-[70vh] overflow-y-auto">
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-xs">
            {t("likes.you_have")} <b className="text-rose-300">{currentLikes}</b> {"\u{1F44D}"}
          </div>
          {offers.isLoading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("likes.loading_packages")}
            </div>
          ) : (offers.data ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-6 text-center text-xs text-muted-foreground">
              {t("likes.no_packages")}
            </div>
          ) : (
            (offers.data ?? []).map((o) => {
              const qtyRaw = qtyByOffer[o.id] ?? "1";
              const qty = Math.max(1, Math.min(50, Math.floor(Number(qtyRaw)) || 1));
              const setQtyStr = (v: string) => setQtyByOffer((m) => ({ ...m, [o.id]: v }));
              const totalLikes = o.likes * qty;
              const totalTickets = o.tickets * qty;
              const bonusPct = baseRatio > 0 ? Math.round(((o.ratio - baseRatio) / baseRatio) * 100) : 0;
              const isBuying = buy.isPending && buy.variables?.offerId === o.id;
              return (
                <div key={o.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 rounded-lg border border-rose-400/40 bg-rose-500/15 px-2.5 py-1.5 text-sm font-bold text-rose-300">
                      <ThumbsUp className="h-3.5 w-3.5" />+{totalLikes}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-muted-foreground">
                        {qty > 1 ? t("likes.for_all", { qty }) : t("likes.for_price")}
                      </div>
                      <div className="text-sm font-medium">
                        {t("likes.tickets_count", { n: totalTickets })}
                      </div>
                      {bonusPct > 0 && (
                        <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
                          {t("likes.bonus_pct", { pct: bonusPct })}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => buy.mutate({ offerId: o.id, quantity: qty })}
                      disabled={isBuying || buy.isPending}
                      className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-600 disabled:opacity-50"
                    >
                      {isBuying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      {t("likes.buy")}
                    </button>
                  </div>
                  {accountOn && o.priceStars != null && (
                    <button
                      type="button"
                      onClick={() => buyStars.mutate({ offerId: o.id, quantity: qty })}
                      disabled={buyStars.isPending}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-400/60 bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-100 transition hover:bg-sky-500/25 disabled:opacity-50"
                    >
                      {buyStars.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Star className="h-3.5 w-3.5 fill-sky-200" />
                      )}
                      {`${(o.priceStars ?? 0) * qty}★ со счёта`}
                    </button>
                  )}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{t("likes.packs_label")}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setQtyStr(String(Math.max(1, Math.min(50, qty - 1))))} className="h-6 w-6 rounded-md border border-border bg-secondary/40">{"\u2212"}</button>
                      <input type="number" min={1} max={50} value={qtyRaw} onChange={(e) => setQtyStr(e.target.value)} onBlur={() => setQtyStr(String(qty))} className="h-6 w-10 rounded-md border border-border bg-background text-center font-mono text-[11px] outline-none" />
                      <button type="button" onClick={() => setQtyStr(String(Math.max(1, Math.min(50, qty + 1))))} className="h-6 w-6 rounded-md border border-border bg-secondary/40">+</button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
