import { useEffect, useState } from "react";
import { Sparkles, Ticket, Loader2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { TiersBreakdown, type RewardTier } from "./shop-shared";

export function PaidClaimConfirmModal({
  maxCount,
  rewardSpec,
  isCombo,
  rewardTiers,
  ticketCost,
  pending,
  onClose,
  onConfirm,
}: {
  maxCount: number;
  rewardSpec: string;
  isCombo: boolean;
  rewardTiers: RewardTier[] | null;
  ticketCost: number;
  pending: boolean;
  onClose: () => void;
  onConfirm: (count: number) => void;
}) {
  const t = useT();
  const [count, setCount] = useState(String(maxCount));

  useEffect(() => {
    setCount(String(maxCount));
  }, [maxCount]);

  const safeCount = Math.max(1, Math.min(maxCount, Math.floor(Number(count)) || 1));
  const unitLabel = isCombo ? t("mynfts.unit_combo") : t("mynfts.unit_nft");
  const ticketsWord = (n: number) =>
    n === 1
      ? t("mynfts.tickets_one", { n })
      : n > 1 && n < 5
        ? t("mynfts.tickets_few", { n })
        : t("mynfts.tickets_many", { n });
  const totalTickets = safeCount * Math.max(1, ticketCost);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-gold" />
            <span className="font-display text-base font-bold">
              {t("mynfts.claim_confirm_title")}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="text-sm text-foreground">
            {t("mynfts.how_many_to_redeem", { unit: unitLabel })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCount(String(Math.max(1, safeCount - 1)))}
              disabled={safeCount <= 1 || pending}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/40 text-foreground transition hover:bg-secondary disabled:opacity-50"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={maxCount}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              onBlur={() => setCount(String(safeCount))}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-center font-mono text-lg outline-none focus:border-gold/50"
            />
            <button
              type="button"
              onClick={() => setCount(String(Math.min(maxCount, safeCount + 1)))}
              disabled={safeCount >= maxCount || pending}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/40 text-foreground transition hover:bg-secondary disabled:opacity-50"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setCount(String(maxCount))}
              disabled={pending}
              className="rounded-lg border border-gold/30 bg-gold/5 px-2.5 py-2 text-[11px] font-medium text-gold transition hover:bg-gold/10 disabled:opacity-50"
            >
              {t("mynfts.max_n", { n: maxCount })}
            </button>
          </div>

          <div className="rounded-xl border border-gold/30 bg-gold/5 p-3 text-sm space-y-2">
            <div>
              {t("mynfts.you_will_spend")}{" "}
              <b className="text-gold">
                {ticketsWord(totalTickets)}
              </b>
              {ticketCost > 1 && (
                <span className="text-muted-foreground">
                  {" "}
                  ({ticketCost} × {safeCount})
                </span>
              )}{" "}
              {t("mynfts.to_redeem_middle")}{" "}
              <b className="text-foreground">
                {safeCount} {unitLabel}
              </b>
              .
            </div>
            {(rewardTiers?.length ?? 0) > 0 ? (
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">
                  {isCombo
                    ? t("mynfts.reward_random_tiers_combo")
                    : t("mynfts.reward_random_tiers_nft")}
                </div>
                <TiersBreakdown tiers={rewardTiers} />
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                {isCombo
                  ? t("mynfts.reward_spec_combo", { spec: rewardSpec })
                  : t("mynfts.reward_spec_nft", { spec: rewardSpec })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex-1 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => onConfirm(safeCount)}
              disabled={pending || safeCount <= 0}
              className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {t("mynfts.redeem_btn", { n: safeCount })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
