// Общие помощники карточек дропов и холда NFT. Магазина билетов больше нет
// (ПРАВИЛА §8.61) — его типы и подсказка про скидки ушли вместе с ним.
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";

export type RewardTier = {
  weight: number;
  kind?: "ft" | "nft" | "pack" | "energy" | "custom";
  rewardMin: number;
  rewardMax: number;
  rewardToken: string;
  nftTitle?: string;
  packId?: string;
  packName?: string;
  /** Сколько паков выдаётся за один клейм (kind=pack). Пусто = 1. */
  packQty?: number;
  /** Товар маркета (kind=custom): имя и картинка; штук — rewardMin..rewardMax. */
  itemName?: string;
  itemImage?: string;
};

export type SisterWallet = { wallet: string; isActive: boolean };

export type HiddenItem = {
  id: string;
  name: string;
  mode: "simple" | "combo";
  rewardSpec: string;
  status: "active" | "ended" | "paused";
};

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
        if (tier.kind === "custom") {
          const n =
            tier.rewardMin === tier.rewardMax
              ? `${tier.rewardMin}`
              : `${tier.rewardMin}–${tier.rewardMax}`;
          const name = tier.itemName?.trim() || t("braid.rw_custom");
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md border border-neon/40 bg-neon/10 px-1.5 py-0.5 text-[10px] text-neon"
              title={`${name} ×${n}`}
            >
              <span className="text-muted-foreground">{pct}%</span>
              <span>·</span>
              {tier.itemImage ? (
                <img
                  src={thumb(tier.itemImage, 32)}
                  alt=""
                  className="h-3.5 w-3.5 rounded-sm object-cover"
                />
              ) : (
                <span className="font-mono">🎒</span>
              )}
              <span className="max-w-[160px] truncate">
                {name} ×{n}
              </span>
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
