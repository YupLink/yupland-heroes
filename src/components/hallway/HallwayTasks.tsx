// Марафон — ежедневные награды (задачи/стрик).

import { type RefObject } from "react";
import { Loader2, Sparkles, Lock, Box, Star, CalendarCheck, ChevronsUp, Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type MarathonScheduleDay = {
  day: number;
  kind: string;
  amount?: number;
  count?: number;
  star?: number;
};

type MarathonData = {
  day: number;
  schedule: MarathonScheduleDay[];
  claimableToday: boolean;
  rewardDays?: number[];
};

export function HallwayMarathon({
  marathon,
  claimPending,
  onClaim,
  marathonRef,
}: {
  marathon: MarathonData;
  claimPending: boolean;
  onClaim: () => void;
  marathonRef: RefObject<HTMLDivElement>;
}) {
  const t = useT();
  return (
    <div ref={marathonRef} className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="mb-2 flex items-center justify-between text-sm font-bold">
        <span className="flex items-center gap-1.5">
          <CalendarCheck className="h-4 w-4 text-neon" /> {t("hallway.marathon")}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("hallway.marathon_day", { day: marathon.day })}
        </span>
      </div>
      <div className="mb-2 grid grid-cols-6 gap-1.5">
        {marathon.schedule.map((d) => {
          const done = d.day <= marathon.day;
          const today = d.day === marathon.day + 1;
          const isChip = d.kind === "chip";
          // Тангибл-награда (фишка/сундук) за этот день уже забрана и повторно
          // не выдаётся — даже после сброса стрика. Гасим ячейку как «недоступно».
          const hardClaimed =
            (d.kind === "chip" || d.kind === "chest") &&
            (marathon.rewardDays ?? []).includes(d.day);
          const icon =
            d.kind === "awareness" ? (
              <Sparkles className="h-4 w-4 text-gold" />
            ) : d.kind === "exp" ? (
              <ChevronsUp className="h-4 w-4 text-neon" />
            ) : d.kind === "chest" ? (
              <Box className="h-4 w-4 text-gold" />
            ) : (
              <Star className="h-4 w-4 fill-gold text-gold" />
            );
          const value =
            d.kind === "awareness" || d.kind === "exp"
              ? `+${d.amount}`
              : d.kind === "chest"
                ? d.count! > 1
                  ? `×${d.count}`
                  : ""
                : `${d.star}★`;
          return (
            <div
              key={d.day}
              title={t("hallway.marathon_day_title", { day: d.day })}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border",
                hardClaimed
                  ? "border-border bg-secondary/30 opacity-40 grayscale"
                  : today
                    ? "border-neon/50 bg-neon/10 ring-1 ring-neon/30"
                    : isChip
                      ? "border-gold/40 bg-gold/10"
                      : "border-transparent bg-secondary/50",
                done && !hardClaimed && "opacity-45"
              )}
            >
              <span className="absolute left-1 top-0.5 text-[8px] leading-none text-muted-foreground">
                {d.day}
              </span>
              {hardClaimed ? (
                <Lock className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-muted-foreground" />
              ) : (
                done && (
                  <Check className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-gold" />
                )
              )}
              {icon}
              {value && (
                <span
                  className={cn(
                    "text-[10px] font-bold leading-none",
                    d.kind === "exp" ? "text-neon" : "text-gold"
                  )}
                >
                  {value}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* Легенда призов */}
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-gold" /> {t("hallway.legend_awareness")}
        </span>
        <span className="flex items-center gap-1">
          <ChevronsUp className="h-3 w-3 text-neon" /> {t("hallway.legend_exp")}
        </span>
        <span className="flex items-center gap-1">
          <Box className="h-3 w-3 text-gold" /> {t("hallway.legend_chest")}
        </span>
        <span className="flex items-center gap-1">
          <Star className="h-3 w-3 fill-gold text-gold" /> {t("hallway.legend_chip")}
        </span>
      </div>
      <button
        type="button"
        onClick={onClaim}
        disabled={!marathon.claimableToday || claimPending}
        className={cn(
          "w-full rounded-xl py-2 text-sm font-bold transition",
          marathon.claimableToday
            ? "bg-neon/15 text-neon ring-1 ring-neon/40 hover:bg-neon/25"
            : "bg-secondary/40 text-muted-foreground"
        )}
      >
        {marathon.claimableToday ? t("hallway.marathon_claim") : t("hallway.marathon_claimed")}
      </button>
    </div>
  );
}
