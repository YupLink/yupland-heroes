import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, ChevronDown, Users, HelpCircle, Check, Swords, Crown, GitFork, Gift } from "lucide-react";
import { useT, useLang } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { getRaidLeaderboard } from "@/server/api/raid-leaderboard";
import { DifficultyBadge } from "./DifficultyBadge";
import { RewardByPlace } from "./RaidRewards";
import type { getRaidFullMap } from "@/server/api/raid-map";

type FullMapT = Awaited<ReturnType<typeof getRaidFullMap>>;
type FullLocT = FullMapT["locations"][number];
type FullNodeT = FullLocT["nodes"][number];

export function HChain({
  nodes,
  render,
}: {
  nodes: FullNodeT[];
  render: (n: FullNodeT) => React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex items-center">
      {nodes.map((n, i) => (
        <div key={n.id} className="flex items-center">
          {i > 0 && <span className="mx-1 h-0.5 w-4 shrink-0 rounded bg-border" />}
          <div className="relative flex flex-col items-center">
            {render(n)}
            {n.isCurrent && (
              <span className="absolute -bottom-4 whitespace-nowrap rounded-full bg-gold/15 px-1.5 text-[9px] font-bold text-gold">
                {t("raid.you_here")}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FullMapNode({
  node,
  selected,
  onClick,
}: {
  node: FullNodeT;
  selected: boolean;
  onClick: () => void;
}) {
  const { dead, isCurrent, explored, reachable } = node;
  const isFork = node.type === "fork";
  return (
    <button
      onClick={onClick}
      data-fm-current={isCurrent ? "1" : undefined}
      className={cn(
        "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 transition active:scale-95",
        selected && "ring-2 ring-gold ring-offset-2 ring-offset-background",
        isFork
          ? isCurrent
            ? "border-gold bg-gold/20 text-gold shadow-gold animate-pulse-gold"
            : "border-gold/60 bg-gold/10 text-gold"
          : isCurrent
            ? "border-gold bg-gold/15 text-gold shadow-gold animate-pulse-gold"
            : dead
              ? "border-border bg-secondary/30 text-muted-foreground/50"
              : reachable
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-dashed border-border bg-secondary/30 text-muted-foreground/60"
      )}
    >
      {isFork ? (
        <GitFork className="h-5 w-5" />
      ) : explored && node.imageUrl ? (
        <img
          src={thumb(node.imageUrl, 96)}
          alt=""
          className={cn("h-full w-full object-cover", dead && "grayscale")}
        />
      ) : node.type === "final" && explored ? (
        <Crown className="h-5 w-5" />
      ) : node.type.startsWith("chest_") && explored ? (
        <Gift className="h-5 w-5" />
      ) : explored ? (
        <Swords className="h-5 w-5" />
      ) : (
        <HelpCircle className="h-5 w-5" />
      )}
      {dead && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-neon">
          <Check className="h-4 w-4" />
        </span>
      )}
    </button>
  );
}

export function FullMapLocation({
  loc,
  isPlayerLoc,
  selId,
  onPick,
  nested,
}: {
  loc: FullLocT;
  isPlayerLoc: boolean;
  selId: string | null;
  onPick: (node: FullNodeT) => void;
  nested?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [openLeaders, setOpenLeaders] = useState(false);
  const fullLeaders = useQuery({
    queryKey: ["raid-leaderboard", loc.id],
    queryFn: () => getRaidLeaderboard({ data: { locationId: loc.id, limit: 2000 } }),
    enabled: openLeaders,
  });
  const locNodes = Array.isArray(loc.nodes) ? loc.nodes : [];
  const leaders = Array.isArray(loc.leaders) ? loc.leaders : [];
  const rewardByPlace = Array.isArray(loc.rewardByPlace) ? loc.rewardByPlace : [];
  const collapse = (chain: FullNodeT[]) => {
    const explored = chain.filter((n) => n.explored);
    const frontier = chain.find((n) => !n.explored) ?? null;
    return frontier ? [...explored, frontier] : explored;
  };
  const rawRoot = locNodes.filter((n) => n.branch === "root");
  const rawA = locNodes.filter((n) => n.branch === "A");
  const rawB = locNodes.filter((n) => n.branch === "B");
  const root = collapse(rawRoot);
  const a = collapse(rawA);
  const b = collapse(rawB);
  const rootCleared = rawRoot.length > 0 && rawRoot.every((n) => n.explored);
  const showBranches = (rawA.length > 0 || rawB.length > 0) && rootCleared;
  const pick = (n: FullNodeT) => (
    <FullMapNode node={n} selected={n.id === selId} onClick={() => onPick(n)} />
  );
  return (
    <div
      data-current={isPlayerLoc ? "1" : undefined}
      className={cn(
        "relative rounded-2xl border",
        nested ? "p-2.5" : "p-3",
        isPlayerLoc ? "border-gold/30 bg-gold/[0.05]" : "border-border/50"
      )}
    >
      {loc.imageUrl && (
        <img
          src={thumb(loc.imageUrl, 480)}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl object-cover opacity-[0.14]"
        />
      )}
      <div className="relative z-10">
        <div className="mb-2 flex items-center gap-2">
          {isPlayerLoc && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
          <span
            className={cn(
              "font-display text-sm font-bold",
              isPlayerLoc && "text-gold"
            )}
          >
            {localizeAssetName(loc.name, lang)}
          </span>
          <DifficultyBadge difficulty={(loc as { difficulty?: string | null }).difficulty} />
          {isPlayerLoc && (
            <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-1.5 text-[9px] font-bold text-gold">
              {t("raid.you_are_here")}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users className="h-3 w-3" /> {loc.headcount}
          </span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-5 pt-1">
          <HChain nodes={root} render={pick} />
          {showBranches && (
            <div className="flex items-center">
              <span className="mx-1 h-0.5 w-3 shrink-0 rounded bg-border" />
              <div className="flex flex-col gap-4">
                {a.length > 0 && <HChain nodes={a} render={pick} />}
                {b.length > 0 && <HChain nodes={b} render={pick} />}
              </div>
            </div>
          )}
        </div>
        {(leaders.length > 0 || rewardByPlace.length > 0) && (
          <div className="mt-1 border-t border-border/40 pt-2">
            <button
              onClick={() => setOpenLeaders((v) => !v)}
              className="flex w-full items-center gap-1.5 text-left"
            >
              <Trophy className="h-3.5 w-3.5 shrink-0 text-gold" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("raid.loc_tournament")}
              </span>
              {loc.myRank != null && (
                <span className="ml-auto rounded-full border border-gold/40 bg-gold/10 px-2 text-[10px] font-bold text-gold">
                  #{loc.myRank}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition",
                  loc.myRank == null && "ml-auto",
                  openLeaders && "rotate-180 text-gold"
                )}
              />
            </button>
            {openLeaders && (
              <div className="mt-1.5">
                <div className="mb-1 text-[10px] text-muted-foreground">
                  {t("raid.loc_tournament_hint")}
                </div>
                <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
                  {(fullLeaders.data?.rows ?? leaders).length === 0 && !fullLeaders.isLoading && (
                    <div className="py-1 text-center text-[11px] text-muted-foreground">
                      {t("raid.no_damage_yet")}
                    </div>
                  )}
                  {(fullLeaders.data?.rows ?? leaders).map((r, i) => {
                    const place = i + 1;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded px-2 py-0.5 text-[12px]",
                          r.mine ? "bg-gold/10" : "odd:bg-secondary/30"
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={cn(
                              "w-5 shrink-0 font-bold",
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
                </div>
                <RewardByPlace places={rewardByPlace} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
