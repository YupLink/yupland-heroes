// PvP battle view components: BattleCard, BattleResult, PowerTable.
// Shared types + helpers used by PvPMatchmaking.tsx.

import { Star, Swords, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { getChipPvpPowerTable } from "@/server/api/chipsPvp";

export type ChipDisplay = {
  id: string;
  level: number;
  imageUrl: string | null;
  templateNo: number | null;
  name: string;
};

export type PairDetail = {
  creatorChipId: string;
  opponentChipId: string;
  creatorStr: number;
  opponentStr: number;
  winnerSide: "creator" | "opponent" | "draw";
  creatorChip: ChipDisplay | null;
  opponentChip: ChipDisplay | null;
};

export function levelRingClass(level: number): string {
  if (level >= 5) return "border-cyan-300";
  if (level >= 4.5) return "border-amber-300";
  if (level >= 4) return "border-amber-400";
  if (level >= 3.5) return "border-purple-300";
  if (level >= 3) return "border-purple-500";
  if (level >= 2.5) return "border-blue-400";
  if (level >= 2) return "border-blue-500";
  if (level >= 1.5) return "border-emerald-500";
  return "border-gray-500";
}

export function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "только что";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

export function ChipAvatar({ chip }: { chip: ChipDisplay }) {
  const ringClass = levelRingClass(chip.level);
  return (
    <div className="relative shrink-0">
      <div className={cn("relative h-16 w-16 overflow-hidden rounded-full border-2", ringClass)}>
        {chip.imageUrl ? (
          <img src={chip.imageUrl} alt={chip.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary text-xl">
            🎯
          </div>
        )}
      </div>
      <div className="absolute -left-1 -top-1 rounded-full bg-purple-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
        #{chip.templateNo ?? "?"}
      </div>
      <div className="mt-1 flex items-center justify-center gap-0.5">
        {Array.from({ length: Math.ceil(chip.level) }, (_, i) => (
          <Star
            key={i}
            className={cn(
              "h-2.5 w-2.5",
              i < Math.floor(chip.level) ? "fill-gold text-gold" : "fill-gold/40 text-gold/40",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function ChipsStrip({ chips }: { chips: ChipDisplay[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {chips.map((c) => (
        <ChipAvatar key={c.id} chip={c} />
      ))}
    </div>
  );
}

// ── Battle card (used in All/Mine) ──
export function BattleCard({
  creator,
  createdAt,
  chips,
  status,
  actionLabel,
  actionVariant,
  onAction,
}: {
  creator: string;
  createdAt: string;
  chips: ChipDisplay[];
  status: string;
  actionLabel?: string;
  actionVariant?: "danger";
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="text-sm font-semibold">@{creator}</div>
        <div className="text-[10px] text-muted-foreground">{relTime(createdAt)}</div>
      </div>
      <ChipsStrip chips={chips} />
      <div className="mt-3 flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground">{status}</div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-bold transition",
              actionVariant === "danger"
                ? "border border-destructive/40 bg-destructive/10 text-destructive"
                : "bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.45)] hover:bg-rose-400",
            )}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// Экран разбора боя по парам. mySide — какой стороне ты принадлежишь
// (creator или opponent), чтобы пометить «твой» / «соперник».
export function BattleResult({
  pairs,
  mySide,
}: {
  pairs: PairDetail[];
  mySide: "creator" | "opponent";
}) {
  const t = useT();
  const wins = pairs.filter((p) => p.winnerSide === mySide).length;
  const losses = pairs.filter((p) => p.winnerSide !== mySide && p.winnerSide !== "draw").length;
  const draws = pairs.filter((p) => p.winnerSide === "draw").length;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
        <div className="text-2xl font-bold">
          <span className="text-success">+{wins}</span>
          <span className="mx-2 text-muted-foreground">/</span>
          <span className="text-destructive">−{losses}</span>
          {draws > 0 && (
            <span className="ml-2 text-muted-foreground">
              ·{draws} {t("pvp.draws_abbr")}
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {t("pvp.result_summary", { won: wins, lost: losses })}
        </div>
      </div>
      <div className="space-y-2">
        {pairs.map((p, i) => {
          const my = mySide === "creator" ? p.creatorChip : p.opponentChip;
          const opp = mySide === "creator" ? p.opponentChip : p.creatorChip;
          const myStr = mySide === "creator" ? p.creatorStr : p.opponentStr;
          const oppStr = mySide === "creator" ? p.opponentStr : p.creatorStr;
          const won = p.winnerSide === mySide;
          const draw = p.winnerSide === "draw";
          return (
            <div
              key={i}
              className={cn(
                "rounded-xl border p-3",
                draw
                  ? "border-border bg-secondary/30"
                  : won
                    ? "border-success/40 bg-success/10"
                    : "border-destructive/40 bg-destructive/10",
              )}
            >
              <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("pvp.pair_label", { n: i + 1 })} · {my?.level ?? "?"}★ vs {opp?.level ?? "?"}★
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                {/* Твоя фишка */}
                <div className="flex flex-col items-center gap-1">
                  {my && <ChipAvatar chip={my} />}
                  <div
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      won ? "text-success" : draw ? "" : "text-destructive",
                    )}
                  >
                    {myStr}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{t("pvp.yours")}</div>
                </div>

                {/* Разделитель */}
                <div className="flex flex-col items-center gap-1">
                  <Swords className="h-4 w-4 text-muted-foreground" />
                  <div className="text-[10px] font-bold uppercase">
                    {draw ? t("pvp.draw") : won ? t("pvp.win") : t("pvp.loss_abbr")}
                  </div>
                </div>

                {/* Фишка соперника */}
                <div className="flex flex-col items-center gap-1">
                  {opp && <ChipAvatar chip={opp} />}
                  <div
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      !won && !draw ? "text-success" : draw ? "" : "text-destructive",
                    )}
                  >
                    {oppStr}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{t("pvp.opponent")}</div>
                </div>
              </div>
              {!draw && (
                <div className="mt-2 text-center text-[11px]">
                  {won ? (
                    <span className="text-success">{t("pvp.chip_won")}</span>
                  ) : (
                    <span className="text-destructive">{t("pvp.chip_lost")}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Power table ──
export function PowerTable() {
  const t = useT();
  const q = useQuery({
    queryKey: ["pvp", "power-table"],
    queryFn: () => getChipPvpPowerTable(),
    staleTime: 1000 * 60 * 30,
  });
  return (
    <section className="rounded-2xl border border-border bg-card/40 p-3">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        {t("pvp.power_by_level")}
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {(q.data ?? []).map((p) => (
          <div
            key={p.level}
            className="rounded-lg border border-border bg-secondary/40 p-2 text-center"
          >
            <div className="flex items-center justify-center gap-0.5">
              {Array.from({ length: Math.ceil(p.level) }, (_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-3 w-3",
                    i < Math.floor(p.level) ? "fill-gold text-gold" : "fill-gold/40 text-gold/40",
                  )}
                />
              ))}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {t("pvp.power_range", { min: p.min, max: p.max })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
