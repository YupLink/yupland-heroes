import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ThumbsUp, Loader2, Search, X, ChevronDown, ChevronUp, Sparkles, Gift } from "lucide-react";
import {
  listLikeCandidates,
  listMyNftsForVoting,
  listNftCatalogForVoting,
  myLikeBalance,
  redeemLikePromocode,
  voteForCandidate,
} from "@/server/api/likes";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { NftImage } from "@/components/NftImage";
import { fmtLikes } from "./LikesResults";
import { humanError } from "@/lib/humanError";

export function LikesVotingSection() {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-sm transition hover:bg-rose-500/10",
          expanded && "rounded-b-none"
        )}
      >
        <ThumbsUp className="h-4 w-4 shrink-0 text-rose-400" />
        <span className="flex-1 text-left text-rose-300">{t("mynfts.vote_next_drop")}</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-rose-300" /> : <ChevronDown className="h-3.5 w-3.5 text-rose-300" />}
      </button>
      {expanded && <LikesVotingBody />}
    </section>
  );
}

function LikesVotingBody() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [voteAmounts, setVoteAmounts] = useState<Record<string, string>>({});
  const [onlyMine, setOnlyMine] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const bal = useQuery({ queryKey: ["my-like-balance"], queryFn: () => myLikeBalance(), staleTime: 30_000 });
  const catalog = useQuery({ queryKey: ["like-catalog", query], queryFn: () => listNftCatalogForVoting({ data: { query, limit: 25 } }), enabled: dropdownOpen, staleTime: 30_000 });
  const myNfts = useQuery({ queryKey: ["like-my-nfts"], queryFn: () => listMyNftsForVoting(), enabled: onlyMine, staleTime: 60_000 });
  const myNftRows = (myNfts.data ?? []).filter((r) => query.trim() ? r.title.toLowerCase().includes(query.trim().toLowerCase()) : true);

  const TOP_PAGE_SIZE = 10;
  const topCandidates = useInfiniteQuery({
    queryKey: ["like-candidates-top"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listLikeCandidates({ data: { page: pageParam, pageSize: TOP_PAGE_SIZE, status: "active" } }),
    getNextPageParam: (last, all) => { const loaded = all.reduce((s, p) => s + p.rows.length, 0); return loaded < (last.total ?? 0) ? all.length : undefined; },
    staleTime: 15_000,
  });
  const topRows = (topCandidates.data?.pages ?? []).flatMap((p) => p.rows);
  const topTotal = topCandidates.data?.pages?.[0]?.total ?? 0;

  const vote = useMutation({
    mutationFn: (args: { candidateId?: string; title?: string; contractId?: string; count: number }) => voteForCandidate({ data: args }),
    onSuccess: () => {
      toast.success(t("likes.like_given"));
      qc.invalidateQueries({ queryKey: ["like-candidates-top"] });
      qc.invalidateQueries({ queryKey: ["like-catalog"] });
      qc.invalidateQueries({ queryKey: ["like-my-nfts"] });
      qc.invalidateQueries({ queryKey: ["my-like-balance"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const onVote = (params: { candidateId?: string; title?: string; contractId?: string; voteKey: string }) => {
    const amount = Math.max(1, Math.floor(Number(voteAmounts[params.voteKey] ?? "1")) || 1);
    if ((bal.data?.available ?? 0) < amount) { toast.error(t("likes.not_enough_likes")); return; }
    vote.mutate({ candidateId: params.candidateId, title: params.title, contractId: params.contractId, count: amount });
  };

  return (
    <div ref={containerRef} className="space-y-3 rounded-b-xl border-x border-b border-rose-400/30 bg-rose-500/5 p-3">
      <div className="flex gap-1 rounded-lg bg-secondary/30 p-0.5 text-xs font-medium">
        <button type="button" onClick={() => setOnlyMine(false)} className={cn("flex-1 rounded-md py-1.5 transition", !onlyMine ? "bg-rose-500/20 text-rose-200" : "text-muted-foreground hover:text-foreground")}>{t("likes.tab_all_nfts")}</button>
        <button type="button" onClick={() => { setOnlyMine(true); setDropdownOpen(false); }} className={cn("flex-1 rounded-md py-1.5 transition", onlyMine ? "bg-rose-500/20 text-rose-200" : "text-muted-foreground hover:text-foreground")}>{t("likes.tab_my_nfts")}</button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onFocus={() => !onlyMine && setDropdownOpen(true)} onChange={(e) => { setQuery(e.target.value); if (!onlyMine) setDropdownOpen(true); }} placeholder={onlyMine ? t("likes.filter_my_placeholder") : t("likes.search_nft_placeholder")} className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-9 text-sm outline-none focus:border-rose-400/50" />
        {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        {!onlyMine && dropdownOpen && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-80 overflow-y-auto rounded-lg border border-border bg-card shadow-2xl">
            {catalog.isLoading ? (
              <div className="flex items-center justify-center py-4 text-xs text-muted-foreground"><Loader2 className="mr-2 h-3 w-3 animate-spin" /> {t("likes.loading")}</div>
            ) : (catalog.data ?? []).length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">{query ? t("likes.not_found_vote_below") : t("likes.catalog_empty")}</div>
            ) : (
              (catalog.data ?? []).map((item) => {
                const voteKey = item.id;
                const amountRaw = voteAmounts[voteKey] ?? "1";
                const amount = Math.max(1, Math.floor(Number(amountRaw)) || 1);
                return (
                  <div key={item.id} className="flex min-h-[56px] items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0 hover:bg-secondary/30">
                    <div className="aspect-square h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-background">{item.image && <NftImage src={item.image} alt={item.title} className="h-full w-full object-cover" />}</div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="truncate text-xs font-medium leading-tight">{item.title}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground leading-tight">
                        <span title={t("likes.in_hands_hint")}>{t("likes.in_hands", { n: item.availableCount })}</span>
                        <span className={cn("rounded px-1 py-0.5", item.currentLikes >= item.targetLikes ? "bg-emerald-400/15 text-emerald-300" : item.currentLikes > 0 ? "bg-rose-400/15 text-rose-300" : "bg-secondary/40 text-muted-foreground")}>👍 {item.currentLikes} / {item.targetLikes}</span>
                        {(item.cycleNo ?? 1) > 1 && <span className="ml-1 rounded bg-amber-400/15 px-1 py-0.5 text-amber-300" title={t("likes.cycle_hint", { no: item.cycleNo })}>{t("likes.cycle_badge", { no: item.cycleNo, mult: item.cycleMultiplier })}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <input type="number" min={1} value={amountRaw} onChange={(e) => setVoteAmounts((m) => ({ ...m, [voteKey]: e.target.value }))} onBlur={() => setVoteAmounts((m) => ({ ...m, [voteKey]: String(amount) }))} className="h-7 w-14 rounded-md border border-border bg-background text-center font-mono text-xs outline-none" />
                      <button type="button" disabled={vote.isPending} onClick={() => onVote({ candidateId: item.candidateId ?? undefined, title: item.candidateId ? undefined : item.title, contractId: item.candidateId ? undefined : item.contractId, voteKey })} className="rounded-md bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-rose-600 disabled:opacity-50">👍 +{amount}</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {onlyMine && (
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {myNfts.isLoading ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground"><Loader2 className="mr-2 h-3 w-3 animate-spin" /> {t("likes.loading")}</div>
          ) : myNftRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-4 text-center text-xs text-muted-foreground">{query.trim() ? t("likes.my_nfts_none_filtered") : t("likes.my_nfts_empty")}</div>
          ) : (
            myNftRows.map((item) => {
              const voteKey = `mine-${item.id}`;
              const amountRaw = voteAmounts[voteKey] ?? "1";
              const amount = Math.max(1, Math.floor(Number(amountRaw)) || 1);
              return (
                <div key={item.id} className="flex min-h-[56px] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-secondary/30">
                  <div className="aspect-square h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-background">{item.image && <NftImage src={item.image} alt={item.title} className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="truncate text-xs font-medium leading-tight">{item.title}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground leading-tight">
                      <span className="rounded bg-secondary/40 px-1 py-0.5 text-foreground/80">{t("likes.you_own", { n: item.myCount })}</span>
                      <span className={cn("rounded px-1 py-0.5", item.currentLikes >= item.targetLikes ? "bg-emerald-400/15 text-emerald-300" : item.currentLikes > 0 ? "bg-rose-400/15 text-rose-300" : "bg-secondary/40 text-muted-foreground")}>👍 {item.currentLikes} / {item.targetLikes}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <input type="number" min={1} value={amountRaw} onChange={(e) => setVoteAmounts((m) => ({ ...m, [voteKey]: e.target.value }))} onBlur={() => setVoteAmounts((m) => ({ ...m, [voteKey]: String(amount) }))} className="h-7 w-14 rounded-md border border-border bg-background text-center font-mono text-xs outline-none" />
                    <button type="button" disabled={vote.isPending} onClick={() => onVote({ candidateId: item.candidateId ?? undefined, title: item.candidateId ? undefined : item.title, contractId: item.candidateId ? undefined : item.contractId, voteKey })} className="rounded-md bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-rose-600 disabled:opacity-50">👍 +{amount}</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <PromocodeInput />

      {topRows.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-2.5 w-2.5 text-rose-400" /> {t("likes.top")}{" "}
            {topTotal > 0 ? t("likes.top_count", { loaded: topRows.length, total: topTotal }) : ""}
          </div>
          <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
            {topRows.map((r) => {
              const voteKey = `top-${r.id}`;
              const amountRaw = voteAmounts[voteKey] ?? "1";
              const amount = Math.max(1, Math.floor(Number(amountRaw)) || 1);
              return (
                <div key={r.id} className={cn("flex items-center gap-2 rounded-lg border bg-card p-2", r.status === "ready" ? "border-success/40 bg-success/5" : "border-border")}>
                  <div className="aspect-square h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border bg-background">{r.image && <NftImage src={r.image} alt={r.title} className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="truncate text-xs font-medium leading-tight">{r.title}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] leading-tight">
                      <span className="font-bold text-rose-300">👍 {r.currentLikes}/{r.targetLikes}</span>
                      {(r.cycleNo ?? 1) > 1 && <span className="rounded bg-amber-400/15 px-1 py-0.5 font-medium text-amber-300" title={t("likes.cycle_hint", { no: r.cycleNo })}>{t("likes.cycle_badge", { no: r.cycleNo, mult: r.cycleMultiplier })}</span>}
                      {r.collectionCount != null && <span className="text-muted-foreground" title={t("likes.in_hands_short_hint")}>{t("likes.in_hands_dot", { n: r.collectionCount })}</span>}
                      {r.myLikes > 0 && <span className="rounded bg-rose-400/15 px-1 py-0.5 text-rose-300">{t("likes.you_likes", { n: r.myLikes })}</span>}
                      {r.status === "ready" && <span className="rounded bg-success/20 px-1 py-0.5 font-medium text-success">{t("likes.ready")}</span>}
                    </div>
                    <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-border/40"><div className={cn("h-full", r.status === "ready" ? "bg-success" : "bg-gradient-to-r from-rose-400/70 to-rose-300")} style={{ width: `${r.progressPct}%` }} /></div>
                  </div>
                  {r.status !== "completed" && (
                    <div className="flex shrink-0 items-center gap-1">
                      <input type="number" min={1} value={amountRaw} onChange={(e) => setVoteAmounts((m) => ({ ...m, [voteKey]: e.target.value }))} onBlur={() => setVoteAmounts((m) => ({ ...m, [voteKey]: String(amount) }))} className="h-7 w-14 rounded-md border border-border bg-background text-center font-mono text-xs outline-none" />
                      <button type="button" disabled={vote.isPending} onClick={() => onVote({ candidateId: r.id, voteKey })} className="rounded-md bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-rose-600 disabled:opacity-50">👍 +{amount}</button>
                    </div>
                  )}
                </div>
              );
            })}
            {topCandidates.hasNextPage && (
              <button type="button" onClick={() => topCandidates.fetchNextPage()} disabled={topCandidates.isFetchingNextPage} className="mt-1 w-full rounded-lg border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-400/10 disabled:opacity-50">
                {topCandidates.isFetchingNextPage ? t("likes.loading") : t("likes.load_more", { n: Math.min(TOP_PAGE_SIZE, topTotal - topRows.length) })}
              </button>
            )}
          </div>
        </div>
      )}

      {bal.data && (
        <div className="text-center text-[10px] text-muted-foreground">
          {t("likes.balance_footer", { available: fmtLikes(bal.data.available), max: bal.data.maxPool })}
        </div>
      )}
    </div>
  );
}

function PromocodeInput() {
  const t = useT();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const redeem = useMutation({
    mutationFn: () => redeemLikePromocode({ data: { code } }),
    onSuccess: (res) => { toast.success(t("likes.promo_redeemed", { likes: res.likesAdded, code: res.code })); setCode(""); qc.invalidateQueries({ queryKey: ["my-like-balance"] }); },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="rounded-lg border border-rose-400/25 bg-rose-500/5 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground"><Gift className="h-3 w-3 text-rose-400" /> {t("likes.promocode")}</div>
      <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) redeem.mutate(); }} className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("likes.enter_code")} className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs uppercase outline-none focus:border-rose-400/50" maxLength={64} />
        <button type="submit" disabled={redeem.isPending || !code.trim()} className="rounded-md bg-rose-500 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-rose-600 disabled:opacity-50">
          {redeem.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("likes.activate")}
        </button>
      </form>
    </div>
  );
}
