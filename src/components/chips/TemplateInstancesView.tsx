import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ChipImage } from "@/components/ChipImage";
import { labelForLevel } from "@/components/chips/levelLabel";
import { getMyChipsForTemplate } from "@/server/api/chips-stake";
import { myChipInventory } from "@/server/api/chips-pack";
import { CHIP_BUSY_HINT, chipBusyView, useNowTick } from "@/components/chips/chipBusy";
import { chipBusyImageClass } from "@/components/chips/ChipBusyNotice";
import { CRAFT_RULES } from "@/server/api/chips-craft";
import { levelKey } from "@/components/chips/collectionsHelpers";
import { useResources } from "@/lib/hooks/useResources";
import { useCraftGoldPrice } from "@/components/chips/useCraftGoldPrice";
import { goldAtMultiplier } from "@/lib/craftGold";
import { ChipDetailModal } from "@/components/chips/ChipDetailModal";

import { thumb } from "@/lib/image";
type ChipSort = "level_desc" | "level_asc" | "date_new" | "date_old" | "serial" | "craftable";

const SORT_OPTIONS: Array<{ key: ChipSort; labelKey: string }> = [
  { key: "level_desc", labelKey: "chips.sort_level_desc" },
  { key: "level_asc", labelKey: "chips.sort_level_asc" },
  { key: "date_new", labelKey: "chips.sort_date_new" },
  { key: "date_old", labelKey: "chips.sort_date_old" },
  { key: "serial", labelKey: "chips.sort_serial" },
  { key: "craftable", labelKey: "chips.sort_craftable" },
];

function TemplateInstancesView({ templateId, onBack }: { templateId: string; onBack: () => void }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["my-chips-for-template", templateId],
    queryFn: () => getMyChipsForTemplate({ data: { templateId } }),
  });
  const inv = useQuery({
    queryKey: ["my-chip-inventory"],
    queryFn: () => myChipInventory(),
  });
  // Улучшение — за золото: баланс со счёта ресурсов, цена — стандарт × множитель.
  const gold = useResources();
  const goldMult = useCraftGoldPrice().data?.multiplier;
  const [openChip, setOpenChip] = useState<string | null>(null);
  // Оглушение и отдых берём из общего инвентаря: getMyChipsForTemplate знает
  // только про отдых, а выбитая боссом фишка должна быть видна и здесь.
  const nowTick = useNowTick();
  const [sort, setSort] = useState<ChipSort>("level_desc");
  const [sortOpen, setSortOpen] = useState(false);

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!q.data) return null;
  const { template, chips } = q.data;

  const goldAvailable = gold.data?.gold ?? 0;
  const allItems = inv.data ?? [];
  const busyById = new Map(allItems.flatMap((g) => g.chips.map((c) => [c.id, c] as const)));
  function chipCanCraft(chip: { id: string; level: number; studying?: boolean }): boolean {
    // Учащуюся крафтить нельзя: её нет в 'owned', сервер откажет — но и
    // подсвечивать «можно» на карточке было бы враньём.
    if (chip.studying) return false;
    if (chip.level >= 5) return false;
    const rule = CRAFT_RULES[levelKey(chip.level)];
    if (!rule) return false;
    if (goldMult == null || goldAvailable < goldAtMultiplier(rule.costGold, goldMult)) return false;
    const sacrLevel = rule.sacrificeLevel ?? chip.level;
    const sameLvl = allItems.filter(
      (i) => i.collectionId === template.collectionId && i.level === sacrLevel,
    );
    const pool: string[] = [];
    for (const grp of sameLvl) {
      if (rule.requireIdentical && grp.templateId !== template.id) continue;
      for (const inst of grp.chips) {
        if (inst.id === chip.id) continue;
        // Учащихся в жертвы тоже не берём — тот же аргумент.
        if (inst.studying) continue;
        pool.push(inst.id);
      }
    }
    return pool.length >= rule.sacrifices;
  }

  const sortedChips = [...chips].sort((a, b) => {
    if (sort === "level_desc") return b.level - a.level;
    if (sort === "level_asc") return a.level - b.level;
    if (sort === "date_new")
      return new Date(b.obtainedAt).getTime() - new Date(a.obtainedAt).getTime();
    if (sort === "date_old")
      return new Date(a.obtainedAt).getTime() - new Date(b.obtainedAt).getTime();
    if (sort === "serial") {
      const sa = a.serialNo ?? Number.MAX_SAFE_INTEGER;
      const sb = b.serialNo ?? Number.MAX_SAFE_INTEGER;
      return sa - sb;
    }
    if (sort === "craftable") {
      const ca = chipCanCraft(a) ? 1 : 0;
      const cb = chipCanCraft(b) ? 1 : 0;
      return cb - ca || b.level - a.level;
    }
    return 0;
  });

  const currentSortOpt = SORT_OPTIONS.find((s) => s.key === sort);
  const currentSortLabel = currentSortOpt ? t(currentSortOpt.labelKey) : t("chips.sort");

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        {t("chips.to_collection")}
      </button>

      <div className="rounded-2xl border border-border bg-card/80 p-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {template.collectionName} · #{template.templateNo}
        </div>
        <div className="font-display text-lg font-bold">{template.name}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {t("chips.your_instances", { n: chips.length })}
        </div>
      </div>

      {chips.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
          {t("chips.no_such_chip")}
        </div>
      ) : (
        <>
          <div className="relative flex items-center justify-end">
            <button
              type="button"
              onClick={() => setSortOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-[11px] font-medium transition hover:bg-secondary"
            >
              <ArrowUp
                className={cn(
                  "h-3 w-3 transition",
                  sort === "level_asc" ? "rotate-0" : "rotate-180",
                )}
              />
              {currentSortLabel}
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-9 z-40 min-w-[200px] overflow-hidden rounded-2xl border border-border bg-card/95 shadow-card backdrop-blur-xl">
                  {SORT_OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => {
                        setSort(o.key);
                        setSortOpen(false);
                      }}
                      className={cn(
                        "block w-full border-b border-border/40 px-3 py-2.5 text-left text-xs last:border-b-0 transition",
                        sort === o.key
                          ? "bg-gold/10 text-gold"
                          : "text-foreground hover:bg-secondary/60",
                      )}
                    >
                      {t(o.labelKey)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {sortedChips.map((c) => {
              const craftable = sort === "craftable" ? chipCanCraft(c) : false;
              const busy = chipBusyView(busyById.get(c.id), nowTick, t);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOpenChip(c.id)}
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-card/80 text-left transition hover:border-gold/40",
                    craftable ? "border-rose-400/50" : "border-border",
                  )}
                >
                  <div className="relative">
                    <ChipImage
                      src={thumb(template.imageUrl, 640)}
                      level={c.level}
                      alt={template.name}
                      className={cn("w-full", chipBusyImageClass(busy))}
                    />
                    {busy && (
                      <span
                        title={t(CHIP_BUSY_HINT[busy.kind])}
                        className={cn(
                          "absolute inset-x-0 bottom-0 truncate px-1 py-px text-center text-[8px] font-bold",
                          busy.kind === "stun"
                            ? "bg-amber-500/85 text-black"
                            : "bg-black/70 text-slate-300",
                        )}
                      >
                        {busy.hint}
                      </span>
                    )}
                    <span className="absolute left-1 top-1 inline-flex items-center justify-center rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-bold backdrop-blur">
                      #{template.templateNo}
                    </span>
                    <span className="absolute right-1 top-1 inline-flex items-center justify-center rounded-full bg-background/80 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground backdrop-blur">
                      #{c.serialNo ?? "?"}
                    </span>
                    {craftable && (
                      <span className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white backdrop-blur">
                        {t("chips.upgrade_badge")}
                      </span>
                    )}
                  </div>
                  <div className="p-1.5">
                    <div className="text-[10px] font-mono text-gold">{labelForLevel(c.level)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {openChip && (
        <ChipDetailModal
          chipId={openChip}
          template={template}
          chips={chips}
          stunUntil={busyById.get(openChip)?.stunUntil ?? null}
          onClose={() => setOpenChip(null)}
        />
      )}
    </div>
  );
}

export { TemplateInstancesView, SORT_OPTIONS };
