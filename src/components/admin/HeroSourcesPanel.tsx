// Обзор «какая коллекция фишек даёт каких героев»: одним экраном видно,
// где механика включена, какая раса и шансы специализаций, и тут же можно
// настроить — не ныряя внутрь карточки коллекции.
import { useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Crown, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminListChipCollections } from "@/server/api/chips-admin";
import { adminGetCollectionHeroConfig } from "@/server/api/collectionHero";
import { CollectionHeroConfig } from "./CollectionHeroConfig";

export function HeroSourcesPanel() {
  const cols = useQuery({
    queryKey: ["admin", "chip-collections"],
    queryFn: () => adminListChipCollections(),
  });
  const list = cols.data ?? [];

  // Конфиг тянем на каждую коллекцию — их немного (десятки), запросы кэшируются.
  const cfgs = useQueries({
    queries: list.map((c) => ({
      queryKey: ["hero-sources", c.id],
      queryFn: () => adminGetCollectionHeroConfig({ data: { collectionId: c.id } }),
      staleTime: 30_000,
    })),
  });

  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-fuchsia-500/15 text-fuchsia-300">
          <Crown className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">Кто из каких фишек</h2>
          <p className="text-[11px] text-muted-foreground">
            Раса героя задаётся коллекцией фишек, специализация выпадает по шансам
          </p>
        </div>
      </div>

      {cols.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {list.map((c, i) => {
            const cfg = cfgs[i]?.data;
            const on = !!cfg?.active;
            const open = openId === c.id;
            const specs = (cfg?.specWeights ?? [])
              .filter((w) => w.weight > 0)
              .sort((a, b) => b.weight - a.weight);
            return (
              <div
                key={c.id}
                className={cn(
                  "rounded-xl border bg-card",
                  on ? "border-fuchsia-500/30" : "border-border",
                )}
              >
                <button
                  onClick={() => setOpenId(open ? null : c.id)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {on
                        ? `${cfg?.race || "раса не выбрана"} · ${
                            specs.length
                              ? specs.map((s) => `${s.spec} ${s.weight}%`).join(", ")
                              : "шансы не заданы"
                          }`
                        : "героев не даёт"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      on
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {on ? "даёт" : "выкл"}
                  </span>
                </button>
                {open && (
                  <div className="px-3 pb-3">
                    <CollectionHeroConfig collectionId={c.id} defaultOpen />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
