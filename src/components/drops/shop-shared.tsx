import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { purchaseTicketsViaToken, listMyShopOffers } from "@/server/api/user-shop";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";

export type RewardTier = {
  weight: number;
  kind?: "ft" | "nft" | "pack";
  rewardMin: number;
  rewardMax: number;
  rewardToken: string;
  nftTitle?: string;
  packId?: string;
  packName?: string;
  /** Сколько паков выдаётся за один клейм (kind=pack). Пусто = 1. */
  packQty?: number;
};

export type SisterWallet = { wallet: string; isActive: boolean };

export type HiddenItem = {
  id: string;
  name: string;
  mode: "simple" | "combo";
  rewardSpec: string;
  status: "active" | "ended" | "paused";
};

export type ShopOffer = Awaited<ReturnType<typeof listMyShopOffers>>[number];
export type EnergyMut = ReturnType<
  typeof useMutation<
    unknown,
    Error,
    { offerId: string; quantity: number }
  >
>;
export type TokenMut = ReturnType<
  typeof useMutation<
    unknown,
    Error,
    {
      id: string;
      ftContract: string | null;
      decimals: number | null;
      priceToken: number | null;
      paymentToken: string | null;
      quantity: number;
    }
  >
>;

export function fmtClaim(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function shortAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000_000)
    return `${(n / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд`;
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  if (n >= 10_000)
    return `${(n / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} тыс`;
  return n.toLocaleString("ru-RU");
}

export function TiersBreakdown({ tiers }: { tiers: RewardTier[] | null | undefined }) {
  const t = useT();
  if (!tiers || tiers.length === 0) return null;
  const sumWeights = tiers.reduce((s, tier) => s + tier.weight, 0);
  const total = Math.max(100, sumWeights);
  const tailPct =
    total > sumWeights
      ? Math.round(((total - sumWeights) / total) * 1000) / 10
      : 0;
  return (
    <div className="flex flex-wrap gap-1">
      {tiers.map((tier, i) => {
        const pct =
          total > 0 ? Math.round((tier.weight / total) * 1000) / 10 : 0;
        const isNft = tier.kind === "nft" && !!tier.nftTitle;
        const isPack = tier.kind === "pack";
        if (isNft) {
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md border border-neon/40 bg-neon/10 px-1.5 py-0.5 text-[10px] text-neon"
              title={`NFT: ${tier.nftTitle}`}
            >
              <span className="text-muted-foreground">{pct}%</span>
              <span>·</span>
              <span className="font-mono">🎁</span>
              <span className="max-w-[160px] truncate">{tier.nftTitle}</span>
            </span>
          );
        }
        if (isPack) {
          const packLabel = tier.packName?.trim() || t("mynfts.pack_word");
          const packQty = Math.max(1, Math.floor(Number(tier.packQty) || 1));
          const packText = packQty > 1 ? `${packLabel} ×${packQty}` : packLabel;
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md border border-neon/40 bg-neon/10 px-1.5 py-0.5 text-[10px] text-neon"
              title={`${t("mynfts.pack_word")}: ${packText}`}
            >
              <span className="text-muted-foreground">{pct}%</span>
              <span>·</span>
              <span className="font-mono">📦</span>
              <span className="max-w-[160px] truncate">{packText}</span>
            </span>
          );
        }
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-md border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[10px] text-gold"
            title={`${tier.rewardToken}: ${tier.rewardMin}–${tier.rewardMax}`}
          >
            <span className="text-muted-foreground">{pct}%</span>
            <span>·</span>
            <span className="font-mono">
              {tier.rewardMin === tier.rewardMax
                ? tier.rewardMin
                : `${tier.rewardMin}–${tier.rewardMax}`}
            </span>
            <span>{tier.rewardToken}</span>
          </span>
        );
      })}
      {tailPct > 0 && (
        <span className="inline-flex items-center rounded-md border border-border bg-secondary/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {tailPct}% {t("mynfts.nothing")}
        </span>
      )}
    </div>
  );
}

export function formatFractional(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n
    .toFixed(4)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

export function formatHMS(totalSec: number): string {
  if (totalSec <= 0) return "0с";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

export function formatCooldown(totalSec: number): string {
  if (totalSec <= 0) return "00:00";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function useSecondTick(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return tick;
}

export function fmtMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}ч ${String(m).padStart(2, "0")}м`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function SubscriptionDiscountTooltip() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-secondary/40 text-[11px] font-bold text-muted-foreground transition hover:border-gold/40 hover:text-foreground"
        aria-label={t("mynfts.sub_discounts_aria")}
      >
        ?
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-30 w-[min(16rem,calc(100vw-2rem))] max-w-[calc(100vw-1rem)] rounded-lg border border-amber-400/30 bg-card p-3 text-[11px] leading-relaxed shadow-2xl">
          <div className="font-medium text-foreground">
            {t("mynfts.sub_discount_title")}
          </div>
          <ul className="mt-1.5 space-y-1 text-muted-foreground">
            <li>
              <span className="text-orange-300">Tier 1</span> — −
              <b className="text-success">5%</b> {t("mynfts.on_any_purchase")}
            </li>
            <li>
              <span className="text-slate-200">Tier 2</span> — −
              <b className="text-success">10%</b> {t("mynfts.on_any_purchase")}
            </li>
            <li>
              <span className="text-amber-300">Tier 3</span> — −
              <b className="text-success">15%</b> {t("mynfts.on_any_purchase")}
            </li>
          </ul>
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            {t("mynfts.discount_stacks_note")}
          </div>
        </div>
      )}
    </div>
  );
}
