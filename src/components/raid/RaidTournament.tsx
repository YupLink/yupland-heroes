import { useQuery } from "@tanstack/react-query";
import { Trophy, ChevronDown, Swords, Check, Skull } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getRaidTournament } from "@/server/api/raid-leaderboard";
import { RewardByPlace } from "./RaidRewards";

export function RaidTournament({
  locId,
  tourOpen,
  setTourOpen,
  tourVisible,
  setTourVisible,
}: {
  locId: string;
  tourOpen: boolean;
  setTourOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  tourVisible: number;
  setTourVisible: (n: number) => void;
}) {
  const t = useT();
  const tour = useQuery({
    queryKey: ["raid-tour", locId],
    queryFn: () => getRaidTournament({ data: { locationId: locId } }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    enabled: tourOpen,
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <button onClick={() => { setTourOpen(!tourOpen); setTourVisible(20); }} className="flex w-full items-center gap-2 text-left">
        <Trophy className="h-4 w-4 shrink-0 text-gold" />
        <span className="text-sm font-semibold">{t("raid.tournament")}</span>
        {tour.data?.current?.myRank != null && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-xs font-bold text-gold">
            #{tour.data.current.myRank}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition",
            tour.data?.current?.myRank == null && "ml-auto",
            tourOpen && "rotate-180 text-gold"
          )}
        />
      </button>

      {tourOpen && (
        <div className="mt-3 space-y-4">
          {tour.data?.current && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Swords className="h-3.5 w-3.5 text-red-300" /> {t("raid.boss")} · {tour.data.current.name}
                {tour.data.current.currentHp <= 0 && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-300">
                    <Check className="h-3 w-3" /> {t("raid.defeated")}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {tour.data.current.rows.length === 0 && (
                  <div className="py-1.5 text-center text-xs text-muted-foreground">
                    {t("raid.nobody_fought_boss")}
                  </div>
                )}
                {tour.data.current.rows.slice(0, tourVisible).map((r, i) => {
                  const place = i + 1;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded px-2 py-1 text-[13px]",
                        r.mine ? "bg-gold/10" : "odd:bg-secondary/40"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={cn(
                            "w-6 shrink-0 font-bold",
                            place === 1 ? "text-gold" : place <= 3 ? "text-foreground" : "text-muted-foreground"
                          )}
                        >
                          #{place}
                        </span>
                        <span className={cn("truncate", r.mine ? "font-semibold text-gold" : "text-muted-foreground")}>
                          {r.name}
                          {r.mine ? t("raid.you_suffix") : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium text-foreground">{r.total.toLocaleString()}</span>
                    </div>
                  );
                })}
                {tour.data.current.rows.length > tourVisible && (
                  <button
                    onClick={() => setTourVisible(tourVisible + 20)}
                    className="mt-1 w-full rounded-lg border border-gold/30 bg-gold/5 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/10"
                  >
                    Ещё {Math.min(20, tour.data.current.rows.length - tourVisible)} из {tour.data.current.rows.length - tourVisible}
                  </button>
                )}
              </div>
              <RewardByPlace
                places={
                  (tour.data.current as { rewardByPlace?: Parameters<typeof RewardByPlace>[0]["places"] })
                    .rewardByPlace
                }
              />
            </div>
          )}

          {(() => {
            const defeated = tour.data?.defeated ?? [];
            return (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Trophy className="h-3.5 w-3.5 text-gold" /> {t("raid.defeated_bosses")}
                {defeated.length > 0 && (
                  <span className="ml-auto rounded-full border border-gold/30 bg-gold/10 px-2 text-[10px] font-bold text-gold">
                    {defeated.length}
                  </span>
                )}
              </div>
              {defeated.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-secondary/20 py-3 text-center text-[11px] text-muted-foreground">
                  {t("raid.defeated_empty")}
                </div>
              ) : (
              <div className="space-y-1.5">
                {defeated.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary/30 p-2">
                    {d.imageUrl ? (
                      <img src={d.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-gold">
                        <Skull className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{d.name}</div>
                    </div>
                    {d.myRank != null ? (
                      <span className="inline-flex shrink-0 items-center rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-bold text-gold">
                        #{d.myRank}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11px] text-muted-foreground">{t("raid.not_fought")}</span>
                    )}
                  </div>
                ))}
              </div>
              )}
            </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
