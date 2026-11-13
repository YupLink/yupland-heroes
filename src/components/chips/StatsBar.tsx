import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins, Battery, Plus, Gem } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useResources } from "@/lib/hooks/useResources";
import { energyTrend } from "@/lib/hooks/useEnergy";
import { getMyEnergy } from "@/server/api/chips-stake";
import { EnergyBuyModal } from "@/routes/chips";
import { NftInputModal } from "./NftInputModal";
import { useEntryRules } from "@/hooks/useEntryRules";

export function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  tone,
  progress,
  actionIcon: ActionIcon,
  actionTitle,
  onClick,
}: {
  icon: typeof Coins;
  label: string;
  value: number | string;
  subValue?: string;
  tone: "gold" | "neon" | "rose";
  progress?: number;
  actionIcon?: typeof Plus;
  actionTitle?: string;
  onClick?: () => void;
}) {
  const ring =
    tone === "gold"
      ? "border-gold/40 bg-gold/5"
      : tone === "neon"
        ? "border-neon/40 bg-neon/5"
        : "border-rose-400/40 bg-rose-400/5";
  const iconColor = tone === "gold" ? "text-gold" : tone === "neon" ? "text-neon" : "text-rose-400";
  const barColor = tone === "gold" ? "bg-gold" : tone === "neon" ? "bg-neon" : "bg-rose-400";
  const inner = (
    <>
      <Icon className={cn("h-5 w-5 shrink-0", iconColor)} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-base font-bold leading-tight">
          {typeof value === "number" ? value.toLocaleString("ru-RU") : value}
        </div>
        <div className="truncate text-[9px] uppercase tracking-widest text-muted-foreground">
          {subValue ?? label}
        </div>
        {progress !== undefined && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-background/60">
            <div
              className={cn("h-full transition-all", barColor)}
              style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
            />
          </div>
        )}
      </div>
      {ActionIcon && (
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background/60",
            tone === "gold"
              ? "border-gold/40 text-gold"
              : tone === "neon"
                ? "border-neon/40 text-neon"
                : "border-rose-400/40 text-rose-400",
          )}
        >
          <ActionIcon className="h-3.5 w-3.5" />
        </span>
      )}
    </>
  );
  const cls = cn(
    "flex w-full items-center gap-2 rounded-2xl border bg-card/60 px-2.5 py-2 backdrop-blur text-left",
    ring,
    onClick && "transition hover:brightness-110 active:scale-[0.99]",
  );
  return onClick ? (
    <button type="button" onClick={onClick} title={actionTitle} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function StatsBar({ showNftInput: allowNftInput = true }: { showNftInput?: boolean }) {
  const t = useT();
  // «Только Google» (§8.127): «Ввести NFT» нет.
  const googleOnly = useEntryRules().googleOnly;
  const showNftInput = allowNftInput && !googleOnly;
  const [nftInputOpen, setNftInputOpen] = useState(false);
  const [energyBuyOpen, setEnergyBuyOpen] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  // Билетов нет (ПРАВИЛА §8.61): на их месте золото — им теперь платят и его получают.
  const resources = useResources();
  const energy = useQuery({
    queryKey: ["my-energy"],
    queryFn: () => getMyEnergy(),
    refetchInterval: 5 * 60_000,
  });

  const gold = Math.floor(resources.data?.gold ?? 0);
  const energyNow = energy.data?.energy ?? 0;
  const energyMax = energy.data?.maxEnergy ?? 30;

  // Выше лимита запас не «полный», а тает (acc-45): обратный отсчёт и
  // перечитывание по нулю нужны и регену, и таянию — только подпись разная.
  const trend = energy.data ? energyTrend(energy.data) : "flat";
  const ticking = trend !== "flat";
  const elapsedSec = (Date.now() - energy.dataUpdatedAt) / 1000;
  const regenRemainSec =
    energy.data && ticking
      ? Math.max(0, Math.ceil((energy.data.nextRegenSec ?? 0) - elapsedSec))
      : 0;
  const regenRefetchedAt = useRef(0);
  useEffect(() => {
    if (
      ticking &&
      energy.data &&
      regenRemainSec <= 0 &&
      energy.dataUpdatedAt > 0 &&
      regenRefetchedAt.current !== energy.dataUpdatedAt
    ) {
      regenRefetchedAt.current = energy.dataUpdatedAt;
      energy.refetch();
    }
  }, [regenRemainSec, ticking, energy]);

  const energySub = ticking
    ? t(trend === "decay" ? "chips.energy_decay_in" : "chips.energy_regen_in", {
        time: `${Math.floor(regenRemainSec / 60)}:${String(regenRemainSec % 60).padStart(2, "0")}`,
      })
    : undefined;

  return (
    <section className="relative z-10 mx-auto max-w-3xl px-4 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={Coins} label={t("chips.gold")} value={resources.data ? gold : "…"} tone="gold" />
        <div className="relative">
          <StatCard
            icon={Battery}
            label={t("chips.energy")}
            value={`${energyNow}/${energyMax}`}
            subValue={energySub}
            progress={energyNow / energyMax}
            tone="rose"
          />
          <button
            type="button"
            onClick={() => setEnergyBuyOpen(true)}
            title={t("chips.energy")}
            className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-rose-400/60 bg-rose-400 text-white shadow-card transition hover:scale-110 active:scale-95"
          >
            <Plus className="h-4 w-4" strokeWidth={3} />
          </button>
        </div>
      </div>
      {energyBuyOpen && <EnergyBuyModal onClose={() => setEnergyBuyOpen(false)} />}
      {showNftInput && (
        <button
          type="button"
          onClick={() => setNftInputOpen(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-neon/30 bg-neon/5 px-3 py-2 text-xs font-semibold text-neon transition hover:bg-neon/10"
        >
          <Gem className="h-3.5 w-3.5" />
          {t("chips.enter_nft")}
        </button>
      )}
      {showNftInput && nftInputOpen && <NftInputModal onClose={() => setNftInputOpen(false)} />}
    </section>
  );
}
