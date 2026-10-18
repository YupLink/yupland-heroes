import { Coins, ImageIcon, Package, Zap } from "lucide-react";
import { parsePackQty } from "./helpers";
import type { DropEvent } from "./types";

export function RewardBadge({ drop }: { drop: DropEvent }) {
  const tiers = drop.rewardTiers ?? [];
  const kindOf = (t: unknown) => (t as { kind?: string }).kind ?? "ft";
  const nftTiers = tiers.filter((t) => kindOf(t) === "nft" && (t as { nftTitle?: string }).nftTitle) as Array<{ nftTitle?: string }>;
  const packTiers = tiers.filter((t) => kindOf(t) === "pack") as Array<{ packQty?: number }>;
  const ftTiers = tiers.filter((t) => kindOf(t) === "ft");
  const energyTiers = tiers.filter((t) => kindOf(t) === "energy") as Array<{ rewardMin?: number; rewardMax?: number }>;
  const onlyNft = nftTiers.length > 0 && ftTiers.length === 0 && packTiers.length === 0 && energyTiers.length === 0;
  const onlyPack = packTiers.length > 0 && ftTiers.length === 0 && nftTiers.length === 0 && energyTiers.length === 0;
  const onlyEnergy = energyTiers.length > 0 && ftTiers.length === 0 && nftTiers.length === 0 && packTiers.length === 0;
  const hasMix = [nftTiers, ftTiers, packTiers, energyTiers].filter((g) => g.length > 0).length > 1;

  if (onlyNft) {
    const titles = Array.from(new Set(nftTiers.map((t) => t.nftTitle).filter(Boolean) as string[]));
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
        <ImageIcon className="h-3 w-3 shrink-0" />
        <span className="truncate" title={titles.join(" / ")}>
          NFT: {titles.length === 1 ? titles[0] : `${titles[0]} +${titles.length - 1}`}
        </span>
      </span>
    );
  }
  if (onlyPack) {
    // Один ярус с packQty=N → «Пак ×N» (N паков за клейм).
    // Несколько pack-ярусов → «Пак: 2 вида» (разные коробки с разными шансами).
    const qty = parsePackQty(packTiers[0]?.packQty);
    const label =
      packTiers.length > 1
        ? `Пак: ${packTiers.length} вида`
        : qty > 1
          ? `Пак ×${qty}`
          : "Пак";
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
        <Package className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
    );
  }
  if (onlyEnergy) {
    const mins = energyTiers.map((t) => t.rewardMin ?? 0);
    const maxs = energyTiers.map((t) => t.rewardMax ?? 0);
    const min = Math.min(...mins);
    const max = Math.max(...maxs);
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-gold">
        <Zap className="h-3 w-3" />
        {min === max ? `${min} энергии` : `${min}–${max} энергии`}
      </span>
    );
  }
  const ftLabel = drop.rewardMin === drop.rewardMax
    ? `${drop.rewardMin} ${drop.rewardToken}`
    : `${drop.rewardMin}–${drop.rewardMax} ${drop.rewardToken}`;
  return (
    <>
      {ftTiers.length > 0 && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-gold">
          <Coins className="h-3 w-3" />
          {ftLabel}
        </span>
      )}
      {hasMix && nftTiers.length > 0 && (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
          <ImageIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">или NFT</span>
        </span>
      )}
      {hasMix && packTiers.length > 0 && (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
          <Package className="h-3 w-3 shrink-0" />
          <span className="truncate">или Пак</span>
        </span>
      )}
      {hasMix && energyTiers.length > 0 && (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
          <Zap className="h-3 w-3 shrink-0" />
          <span className="truncate">или ⚡ энергия</span>
        </span>
      )}
    </>
  );
}
