import { useEffect, useMemo, useState } from "react";
import { Sparkles, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropCard } from "./DropCard";
import { FilterDropdown } from "./FilterDropdown";
import type { DropEvent, DropFilterMode, DropFilterStatus, DropFilterPay, DropSortBy } from "./types";

export function DropsList({
  drops,
  isLoading,
  opBalances,
  tokens,
  editingId,
  onEdit,
  onCancelEdit,
  onCopy,
  onDelete,
  deleting,
  onTogglePause,
  togglingPause,
  onToggleRecurring,
  togglingRecurring,
}: {
  drops: DropEvent[];
  isLoading: boolean;
  opBalances: Array<{ symbol: string; raw: string; human: string; decimals: number }>;
  tokens: Array<{ symbol: string; ftContract: string; decimals: number }>;
  editingId: string | null;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onCopy: (d: DropEvent) => void;
  onDelete: (d: DropEvent) => void;
  deleting: boolean;
  onTogglePause: (d: DropEvent) => void;
  togglingPause: boolean;
  onToggleRecurring: (d: DropEvent) => void;
  togglingRecurring: boolean;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<DropFilterMode>("all");
  const [status, setStatus] = useState<DropFilterStatus>("all");
  const [pay, setPay] = useState<DropFilterPay>("all");
  const [token, setToken] = useState<string>("all");
  const [sortBy, setSortBy] = useState<DropSortBy>("new");
  const PAGE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE);

  const tokensInUse = useMemo(() => {
    const s = new Set<string>();
    for (const d of drops) s.add(d.rewardToken);
    return Array.from(s).sort();
  }, [drops]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = drops.filter((d) => {
      if (mode !== "all" && d.mode !== mode) return false;
      if (status !== "all" && d.status !== status) return false;
      if (pay === "free" && !d.freeClaim) return false;
      if (pay === "paid" && d.freeClaim) return false;
      if (token !== "all" && d.rewardToken !== token) return false;
      if (q) {
        const inTitle = d.title.toLowerCase().includes(q);
        const inReqs = d.requirements?.some((r) => r.title.toLowerCase().includes(q)) ?? false;
        const inId = d.id.toLowerCase().includes(q);
        if (!inTitle && !inReqs && !inId) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (sortBy) {
        case "new": return b.createdAt.localeCompare(a.createdAt);
        case "old": return a.createdAt.localeCompare(b.createdAt);
        case "claims": return (b.claimsCount ?? 0) - (a.claimsCount ?? 0);
        case "name": return a.title.localeCompare(b.title);
      }
    });
    return out;
  }, [drops, query, mode, status, pay, token, sortBy]);

  useEffect(() => { setVisibleCount(PAGE); }, [query, mode, status, pay, token, sortBy]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const resetFilters = () => { setQuery(""); setMode("all"); setStatus("all"); setPay("all"); setToken("all"); setSortBy("new"); };
  const filtersActive = query !== "" || mode !== "all" || status !== "all" || pay !== "all" || token !== "all" || sortBy !== "new";

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-gold" /> Активные дропы
          <span className="text-xs text-muted-foreground">· {filtered.length}{filtered.length !== drops.length && ` из ${drops.length}`}</span>
        </div>
        {filtersActive && (
          <button type="button" onClick={resetFilters} className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-secondary/30 px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground">
            <X className="h-3 w-3" /> Сбросить
          </button>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск…" className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-9 text-sm outline-none focus:border-gold/50" />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <FilterDropdown label="Тип" value={mode} onChange={(v) => setMode(v as DropFilterMode)} options={[{ value: "all", label: "Все" }, { value: "simple", label: "Drop" }, { value: "combo", label: "Combo" }]} />
        <FilterDropdown label="Статус" value={status} onChange={(v) => setStatus(v as DropFilterStatus)} options={[{ value: "all", label: "Все" }, { value: "active", label: "Active" }, { value: "paused", label: "Paused" }]} />
        <FilterDropdown label="Оплата" value={pay} onChange={(v) => setPay(v as DropFilterPay)} options={[{ value: "all", label: "Все" }, { value: "free", label: "Free" }, { value: "paid", label: "Платные" }]} />
        {tokensInUse.length > 1 && (
          <FilterDropdown label="Токен" value={token} onChange={setToken} options={[{ value: "all", label: "Все" }, ...tokensInUse.map((t) => ({ value: t, label: t }))]} />
        )}
        <FilterDropdown label="Сорт." value={sortBy} onChange={(v) => setSortBy(v as DropSortBy)} options={[{ value: "new", label: "Новые" }, { value: "old", label: "Старые" }, { value: "claims", label: "По клеймам" }, { value: "name", label: "A-Z" }]} />
      </div>
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Загрузка…</div>
      ) : drops.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">Пока ни одного дропа. Жми «Создать дроп» сверху.</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Ничего не нашлось по фильтрам. <button type="button" onClick={resetFilters} className="underline transition hover:text-foreground">Сбросить</button>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((d) => {
            const bal = opBalances.find((b) => b.symbol === d.rewardToken);
            return (
              <DropCard key={d.id} drop={d} editing={editingId === d.id} onEdit={() => onEdit(d.id)} onCancelEdit={onCancelEdit} tokens={tokens} serviceBalance={bal ?? null} onCopy={() => onCopy(d)} onDelete={() => onDelete(d)} deleting={deleting} onTogglePause={() => onTogglePause(d)} togglingPause={togglingPause} onToggleRecurring={() => onToggleRecurring(d)} togglingRecurring={togglingRecurring} />
            );
          })}
          {hasMore && (
            <button type="button" onClick={() => setVisibleCount((c) => c + PAGE)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card py-3 text-sm font-medium text-muted-foreground transition hover:text-foreground">
              <ChevronDown className="h-4 w-4" /> Показать ещё (+{Math.min(PAGE, filtered.length - visibleCount)})
              <span className="text-xs text-muted-foreground/70">· {visibleCount} из {filtered.length}</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
