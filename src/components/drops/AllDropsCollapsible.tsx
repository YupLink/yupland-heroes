import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { listAllActiveDrops } from "@/server/api/user-drops";
import { AllDropMiniCard } from "./AllDropMiniCard";

type DropFilter = "all" | "free" | "paid" | "combo";
type DropSort = "newest" | "reward-desc" | "reward-asc";
const PAGE_SIZE = 20;

export function AllDropsCollapsible({
  ownableDropIds,
  ownedTitleKeys,
}: {
  ownableDropIds: Set<string>;
  ownedTitleKeys: Set<string>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<DropFilter>("all");
  const [sort, setSort] = useState<DropSort>("newest");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);

  const all = useQuery({
    queryKey: ["all-active-drops", "v2"],
    queryFn: () => listAllActiveDrops(),
    enabled: open,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const filtered = useMemo(() => {
    const items = all.data ?? [];
    const q = search.trim().toLowerCase();
    return items
      .filter((d) => {
        if (filter === "free" && !d.freeClaim) return false;
        if (filter === "paid" && d.freeClaim) return false;
        if (filter === "combo" && d.mode !== "combo") return false;
        if (q) {
          const inTitle = d.title.toLowerCase().includes(q);
          const inReqs =
            d.requirements?.some((r) =>
              r.title.toLowerCase().includes(q)
            ) ?? false;
          if (!inTitle && !inReqs) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === "reward-desc") return b.rewardMax - a.rewardMax;
        if (sort === "reward-asc") return a.rewardMax - b.rewardMax;
        return 0;
      });
  }, [all.data, filter, sort, search]);

  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [filter, sort, search, open]);

  const visible = filtered.slice(0, shown);
  const hasMore = filtered.length > shown;
  const totalCount = all.data?.length ?? 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-secondary/30"
      >
        <Sparkles className="h-4 w-4 text-gold" />
        <span className="text-sm font-medium text-foreground">
          {t("mynfts.all_drops_block")}
        </span>
        <span className="text-xs text-muted-foreground">
          {totalCount > 0 ? `· ${totalCount}` : ""}
        </span>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">
          · {t("mynfts.know_what_to_aim")}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 text-muted-foreground transition",
            open && "rotate-180 text-gold"
          )}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/50 p-3">
          {(all.data?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ["all", t("mynfts.filter_all")],
                    ["free", "Free"],
                    ["paid", t("mynfts.filter_paid")],
                    ["combo", "Combo"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                      filter === k
                        ? "border-gold/40 bg-gold/15 text-gold"
                        : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {label}
                  </button>
                ))}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as DropSort)}
                  className="ml-auto rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] outline-none focus:border-gold/50"
                >
                  <option value="newest">{t("mynfts.sort_newest")}</option>
                  <option value="reward-desc">{t("mynfts.sort_reward_desc")}</option>
                  <option value="reward-asc">{t("mynfts.sort_reward_asc")}</option>
                </select>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("mynfts.search_nft_placeholder")}
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-gold/50"
              />
            </div>
          )}

          {all.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("mynfts.loading_short")}
            </div>
          ) : totalCount === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {t("mynfts.no_active_drops")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {t("mynfts.nothing_by_filters")}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {visible.map((d) => (
                  <AllDropMiniCard
                    key={d.id}
                    drop={d}
                    ownable={ownableDropIds.has(d.id)}
                    ownedTitleKeys={ownedTitleKeys}
                  />
                ))}
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE_SIZE)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  {t("mynfts.show_more", { n: filtered.length - shown })}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
