import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trophy, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { listBossLeaderboard } from "@/server/api/boss";

type BossData = {
  boss?: {
    weekNo?: number;
  } | null;
  yourRank?: number | null;
  yourDamage?: number;
  lastWeek?: Array<{ wallet: string; total: number }>;
  leaderboard?: Array<{ wallet: string; name?: string; total: number }>;
  leaderboardTotal?: number;
};

export function BossStats({ bossData, b }: { bossData?: BossData | null; b: { weekNo?: number } | null }) {
  const t = useT();
  const [tourOpen, setTourOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [bossTourOpen, setBossTourOpen] = useState(false);
  const [tourBoss, setTourBoss] = useState<string | null>(null);

  const bossHist = useQuery({
    queryKey: ["boss-reward-history"],
    queryFn: () => import("@/server/api/boss").then((m) => m.getMyBossRewardHistory()),
    enabled: histOpen,
  });
  const bossTour = useQuery({
    queryKey: ["boss-tournament-history"],
    queryFn: () => import("@/server/api/boss").then((m) => m.getBossTournamentHistory()),
    enabled: bossTourOpen,
  });

  const [extraTop, setExtraTop] = useState<Array<{ wallet: string; name?: string; total: number }>>([]);
  const loadMore = useMutation({
    mutationFn: () =>
      listBossLeaderboard({
        data: { offset: lbBase.length + extraTop.length, limit: 2000 },
      }),
    onSuccess: (res) => setExtraTop((prev) => [...prev, ...res.rows]),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const lbBase = bossData?.leaderboard ?? [];
  const topWeek = useMemo(() => {
    const lbSeen = new Set(lbBase.map((r) => r.wallet));
    return [...lbBase, ...extraTop.filter((r) => !lbSeen.has(r.wallet))];
  }, [lbBase, extraTop]);
  const topTotal = bossData?.leaderboardTotal ?? topWeek.length;

  useEffect(() => {
    if (!tourOpen) return;
    if (topWeek.length >= topTotal) return;
    if (loadMore.isPending) return;
    loadMore.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen, topTotal]);

  return (
    <>
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <button onClick={() => setTourOpen((v) => !v)} className="flex w-full items-center justify-between p-3.5 text-left">
          <span className="flex items-center gap-1.5 text-sm font-semibold"><Trophy className="h-4 w-4 text-gold" /> {t("boss.tournament_week", { n: b?.weekNo ?? "?" })}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {bossData?.yourRank != null && (
              <span
                title={t("boss.your_place")}
                className="inline-flex shrink-0 items-center rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[11px] font-bold leading-none text-gold"
              >
                #{bossData.yourRank}
              </span>
            )}
            <span className="whitespace-nowrap">{t("boss.your_damage")} <b className="text-gold">{(bossData?.yourDamage ?? 0).toLocaleString()}</b></span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition", tourOpen && "rotate-180")} />
          </span>
        </button>
        {tourOpen && (
          <div className="space-y-3 border-t border-border/60 p-3.5 animate-float-up">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">{t("boss.this_week")}</div>
              {topWeek.length === 0 ? (
                <p className="py-1 text-center text-xs text-muted-foreground">{t("boss.nobody_fought")}</p>
              ) : (
                <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
                  <div className="mb-1 text-[10px] text-muted-foreground tabular-nums">
                    Всего бьющих: {topTotal}{loadMore.isPending ? " (загрузка…)" : ""}
                  </div>
                  {topWeek.map((row, i) => (
                    <div key={row.wallet} className={cn(
                      "flex items-center justify-between rounded-lg px-2 py-1.5 text-sm",
                      i < 3 ? "border border-gold/20 bg-gold/5" : "odd:bg-secondary/40",
                    )}>
                      <span className="truncate">
                        <span className={cn("mr-2 inline-block w-5 text-center font-bold", i === 0 ? "text-gold" : i < 3 ? "text-gold/70" : "text-muted-foreground")}>
                          {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                        </span>
                        {row.name ?? row.wallet}
                      </span>
                      <span className="font-medium">{Number(row.total).toLocaleString()}</span>
                    </div>
                  ))}
                  {topWeek.length < topTotal && (
                    <button
                      type="button"
                      onClick={() => loadMore.mutate()}
                      disabled={loadMore.isPending}
                      className="mt-1 w-full rounded-lg border border-gold/30 bg-gold/5 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/10 disabled:opacity-50"
                    >
                      {loadMore.isPending ? (
                        <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
                      ) : (
                        t("boss.show_more", { n: topTotal - topWeek.length })
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
            {(bossData?.lastWeek ?? []).length > 0 && (
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t("boss.last_week_final")}</div>
                <div className="space-y-1">
                  {(bossData?.lastWeek ?? []).map((row, i) => (
                    <div key={row.wallet} className="flex items-center justify-between rounded-lg px-2 py-1 text-xs odd:bg-secondary/30">
                      <span className="truncate"><span className="mr-2 inline-block w-4 text-muted-foreground">{i + 1}</span>{row.wallet}</span>
                      <span>{Number(row.total).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <button onClick={() => setHistOpen((v) => !v)} className="flex w-full items-center justify-between p-3.5 text-left">
          <span className="flex items-center gap-1.5 text-sm font-semibold"><Trophy className="h-4 w-4 text-muted-foreground" /> {t("boss.reward_history")}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", histOpen && "rotate-180")} />
        </button>
        {histOpen && (
          <div className="border-t border-border/60 p-3.5">
            {bossHist.isLoading ? (
              <div className="py-2 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : (bossHist.data ?? []).length === 0 ? (
              <div className="py-2 text-center text-xs text-muted-foreground">{t("boss.reward_history_empty")}</div>
            ) : (
              <div className="space-y-1">
                {(bossHist.data ?? []).map((h, i) => {
                  const label = h.rewards
                    .map((rw) => rw.kind === "pack" ? `🎁 ${t("boss.reward_pack_short")}` : `${rw.amount} ${rw.kind}`)
                    .join(" + ");
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs odd:bg-secondary/30">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded-md bg-gold/10 px-1.5 py-0.5 font-bold text-gold">#{h.place}</span>
                        <span className="truncate text-muted-foreground">{h.bossName ?? t("boss.week_short", { n: h.weekNo })}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-right">
                        <b className="text-foreground">{label}</b>
                        {h.claimed ? <span className="text-success">✓</span> : <span className="text-[10px] text-gold">{t("boss.unclaimed_short")}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <button onClick={() => setBossTourOpen((v) => !v)} className="flex w-full items-center justify-between p-3.5 text-left">
          <span className="flex items-center gap-1.5 text-sm font-semibold"><Trophy className="h-4 w-4 text-muted-foreground" /> История боссов</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", bossTourOpen && "rotate-180")} />
        </button>
        {bossTourOpen && (
          <div className="border-t border-border/60 p-3.5">
            {bossTour.isLoading ? (
              <div className="py-2 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : (bossTour.data ?? []).length === 0 ? (
              <div className="py-2 text-center text-xs text-muted-foreground">Пока нет завершённых турниров</div>
            ) : (
              <div className="space-y-1">
                {(bossTour.data ?? []).map((bt) => {
                  const open = tourBoss === bt.id;
                  return (
                    <div key={bt.id} className="overflow-hidden rounded-lg odd:bg-secondary/30">
                      <button onClick={() => setTourBoss(open ? null : bt.id)} className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-xs">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 rounded-md bg-gold/10 px-1.5 py-0.5 font-bold text-gold">{bt.isMini ? "🐣" : "⚔️"}</span>
                          <span className="truncate text-foreground">{bt.name}</span>
                          {bt.killed && <span className="shrink-0 text-[10px] text-success">повержен</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                          {bt.top.length} уч.
                          <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
                        </span>
                      </button>
                      {open && (
                        <div className="space-y-0.5 px-2 pb-2">
                          {bt.top.map((p) => (
                            <div key={p.place} className={cn("flex items-center justify-between gap-2 text-[11px]", p.isMe && "rounded bg-success/10 px-1")}>
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className={cn("shrink-0 font-bold", p.isMe ? "text-success" : p.place === 1 ? "text-gold" : p.place <= 3 ? "text-foreground" : "text-muted-foreground")}>#{p.place}</span>
                                <span className={cn("truncate", p.isMe ? "font-semibold text-success" : "text-muted-foreground")}>{p.name}{p.isMe ? " · ты" : ""}</span>
                              </span>
                              <span className={cn("shrink-0 font-medium", p.isMe ? "text-success" : "text-foreground")}>{p.damage.toLocaleString("ru-RU")}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
