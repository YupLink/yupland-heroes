import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDropClaimers } from "@/server/api/admin-stats";
import {
  Coins,
  Users,
  Gift,
  Ticket,
  AlertTriangle,
  Loader2,
  Check,
  Pencil,
  Trash2,
  Play,
  Pause,
  Repeat,
  Sparkles,
  ChevronDown,
  Copy,
  X,
  ImageIcon,
  Package,
  Layers,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DropEvent } from "./DropEditor";
import { DropEditForm } from "./DropEditor";

/**
 * Бейдж с описанием награды в карточке дропа. Учитывает rewardTiers:
 * NFT-only → "🖼 NFT: ...", FT-only → "💰 X TOKEN", смешанный → оба.
 */
function RewardBadge({ drop }: { drop: DropEvent }) {
  const tiers = drop.rewardTiers ?? [];
  const kindOf = (t: unknown) =>
    (t as { kind?: string }).kind ?? "ft";
  const nftTiers = tiers.filter(
    (t) => kindOf(t) === "nft" && (t as { nftTitle?: string }).nftTitle
  ) as Array<{ nftTitle?: string }>;
  const packTiers = tiers.filter((t) => kindOf(t) === "pack");
  const ftTiers = tiers.filter((t) => kindOf(t) === "ft");
  const energyTiers = tiers.filter((t) => kindOf(t) === "energy") as Array<{
    rewardMin?: number;
    rewardMax?: number;
  }>;
  const onlyNft =
    nftTiers.length > 0 && ftTiers.length === 0 && packTiers.length === 0 && energyTiers.length === 0;
  const onlyPack =
    packTiers.length > 0 && ftTiers.length === 0 && nftTiers.length === 0 && energyTiers.length === 0;
  const onlyEnergy =
    energyTiers.length > 0 && ftTiers.length === 0 && nftTiers.length === 0 && packTiers.length === 0;
  const hasMix =
    [nftTiers, ftTiers, packTiers, energyTiers].filter((g) => g.length > 0).length > 1;

  if (onlyNft) {
    const titles = Array.from(
      new Set(nftTiers.map((t) => t.nftTitle).filter(Boolean) as string[])
    );
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
        <ImageIcon className="h-3 w-3 shrink-0" />
        <span className="truncate" title={titles.join(" / ")}>
          NFT: {titles.length === 1 ? titles[0] : `${titles[0]} +${titles.length - 1}`}
        </span>
      </span>
    );
  }

  if (onlyPack) {
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
        <Package className="h-3 w-3 shrink-0" />
        <span className="truncate">
          Пак{packTiers.length > 1 ? ` ×${packTiers.length}` : ""}
        </span>
      </span>
    );
  }

  if (onlyEnergy) {
    const mins = energyTiers.map((t) => t.rewardMin ?? 0);
    const maxs = energyTiers.map((t) => t.rewardMax ?? 0);
    const min = Math.min(...mins);
    const max = Math.max(...maxs);
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-gold">
        <Zap className="h-3 w-3" />
        {min === max ? `${min} энергии` : `${min}–${max} энергии`}
      </span>
    );
  }

  // FT (или микс с NFT/Pack — основной бейдж FT, мелкие подписи рядом)
  const ftLabel =
    drop.rewardMin === drop.rewardMax
      ? `${drop.rewardMin} ${drop.rewardToken}`
      : `${drop.rewardMin}–${drop.rewardMax} ${drop.rewardToken}`;
  return (
    <>
      {ftTiers.length > 0 && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-gold">
          <Coins className="h-3 w-3" />
          {ftLabel}
        </span>
      )}
      {hasMix && nftTiers.length > 0 && (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
          <ImageIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">или NFT</span>
        </span>
      )}
      {hasMix && packTiers.length > 0 && (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
          <Package className="h-3 w-3 shrink-0" />
          <span className="truncate">или Пак</span>
        </span>
      )}
      {hasMix && energyTiers.length > 0 && (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
          <Zap className="h-3 w-3 shrink-0" />
          <span className="truncate">или ⚡ энергия</span>
        </span>
      )}
    </>
  );
}

// ──────── Поиск / фильтры / сортировка ────────
type DropFilterMode = "all" | "simple" | "combo";
type DropFilterStatus = "all" | "active" | "paused";
type DropFilterPay = "all" | "free" | "paid";
type DropSortBy = "new" | "old" | "claims" | "name";

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
  opBalances: Array<{
    symbol: string;
    raw: string;
    human: string;
    decimals: number;
  }>;
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
  // Пагинация порциями: рендерим первые PAGE дропов, остальное — по кнопке.
  // Иначе при ~357 дропах список тормозит.
  const PAGE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE);

  // Список токенов в фильтре — только те, что реально используются дропами.
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
        const inReqs =
          d.requirements?.some((r) => r.title.toLowerCase().includes(q)) ??
          false;
        const inId = d.id.toLowerCase().includes(q);
        if (!inTitle && !inReqs && !inId) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (sortBy) {
        case "new":
          return b.createdAt.localeCompare(a.createdAt);
        case "old":
          return a.createdAt.localeCompare(b.createdAt);
        case "claims":
          return (b.claimsCount ?? 0) - (a.claimsCount ?? 0);
        case "name":
          return a.title.localeCompare(b.title);
      }
    });
    return out;
  }, [drops, query, mode, status, pay, token, sortBy]);

  // При смене фильтров/сортировки/запроса — сбрасываем порцию на первую.
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [query, mode, status, pay, token, sortBy]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const resetFilters = () => {
    setQuery("");
    setMode("all");
    setStatus("all");
    setPay("all");
    setToken("all");
    setSortBy("new");
  };
  const filtersActive =
    query !== "" ||
    mode !== "all" ||
    status !== "all" ||
    pay !== "all" ||
    token !== "all" ||
    sortBy !== "new";

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-gold" />
          Активные дропы
          <span className="text-xs text-muted-foreground">
            · {filtered.length}
            {filtered.length !== drops.length && ` из ${drops.length}`}
          </span>
        </div>
        {filtersActive && (
          <button
            type="button"
            onClick={resetFilters}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-secondary/30 px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Сбросить
          </button>
        )}
      </div>

      {/* Search + collapsed filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск…"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-9 text-sm outline-none focus:border-gold/50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <FilterDropdown
          label="Тип"
          value={mode}
          onChange={(v) => setMode(v as DropFilterMode)}
          options={[
            { value: "all", label: "Все" },
            { value: "simple", label: "Drop" },
            { value: "combo", label: "Combo" },
          ]}
        />
        <FilterDropdown
          label="Статус"
          value={status}
          onChange={(v) => setStatus(v as DropFilterStatus)}
          options={[
            { value: "all", label: "Все" },
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
          ]}
        />
        <FilterDropdown
          label="Оплата"
          value={pay}
          onChange={(v) => setPay(v as DropFilterPay)}
          options={[
            { value: "all", label: "Все" },
            { value: "free", label: "Free" },
            { value: "paid", label: "Платные" },
          ]}
        />
        {tokensInUse.length > 1 && (
          <FilterDropdown
            label="Токен"
            value={token}
            onChange={setToken}
            options={[
              { value: "all", label: "Все" },
              ...tokensInUse.map((t) => ({ value: t, label: t })),
            ]}
          />
        )}
        <FilterDropdown
          label="Сорт."
          value={sortBy}
          onChange={(v) => setSortBy(v as DropSortBy)}
          options={[
            { value: "new", label: "Новые" },
            { value: "old", label: "Старые" },
            { value: "claims", label: "По клеймам" },
            { value: "name", label: "A-Z" },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Загрузка…
        </div>
      ) : drops.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Пока ни одного дропа. Жми «Создать дроп» сверху.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Ничего не нашлось по фильтрам.{" "}
          <button
            type="button"
            onClick={resetFilters}
            className="underline transition hover:text-foreground"
          >
            Сбросить
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((d) => {
            const bal = opBalances.find((b) => b.symbol === d.rewardToken);
            return (
              <DropCard
                key={d.id}
                drop={d}
                editing={editingId === d.id}
                onEdit={() => onEdit(d.id)}
                onCancelEdit={onCancelEdit}
                tokens={tokens}
                serviceBalance={bal ?? null}
                onCopy={() => onCopy(d)}
                onDelete={() => onDelete(d)}
                deleting={deleting}
                onTogglePause={() => onTogglePause(d)}
                togglingPause={togglingPause}
                onToggleRecurring={() => onToggleRecurring(d)}
                togglingRecurring={togglingRecurring}
              />
            );
          })}
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + PAGE)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card py-3 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <ChevronDown className="h-4 w-4" />
              Показать ещё (+{Math.min(PAGE, filtered.length - visibleCount)})
              <span className="text-xs text-muted-foreground/70">
                · {visibleCount} из {filtered.length}
              </span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function FilterDropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const current = options.find((o) => o.value === value);
  const isDefault = value === options[0]?.value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
            isDefault
              ? "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
              : "border-gold/40 bg-gold/10 text-gold"
          )}
        >
          <span>
            {label}
            {!isDefault && current ? `: ${current.label}` : ""}
          </span>
          <ChevronDown className="h-3 w-3 transition group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        collisionPadding={8}
        className="max-h-[60vh] min-w-[9rem] overflow-y-auto rounded-xl"
      >
        {options.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onSelect={() => onChange(o.value)}
            className={cn(
              "flex items-center justify-between gap-3 text-xs",
              value === o.value ? "font-medium text-gold" : "text-foreground"
            )}
          >
            <span>{o.label}</span>
            {value === o.value && <Check className="h-3 w-3" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DropCard({
  drop,
  editing,
  onEdit,
  onCancelEdit,
  onCopy,
  onDelete,
  deleting,
  tokens,
  serviceBalance,
  onTogglePause,
  togglingPause,
  onToggleRecurring,
  togglingRecurring,
}: {
  drop: DropEvent;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  deleting: boolean;
  tokens: Array<{ symbol: string; ftContract: string; decimals: number }>;
  serviceBalance: {
    symbol: string;
    raw: string;
    human: string;
    decimals: number;
  } | null;
  onTogglePause: () => void;
  togglingPause: boolean;
  onToggleRecurring: () => void;
  togglingRecurring: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const claimers = useQuery({
    queryKey: ["admin", "drop-claimers", drop.id],
    queryFn: () => getDropClaimers({ data: { dropId: drop.id } }),
    enabled: expanded,
  });
  // Сколько ещё может потребоваться. Для существующих дропов сервер уже
  // посчитал maxRemaining (учёл уже выплаченное / уже пришедших юзеров).
  const remaining = drop.maxRemaining;
  let warn: string | null = null;
  if (remaining != null && serviceBalance) {
    const need = BigInt(remaining) * 10n ** BigInt(serviceBalance.decimals);
    if (BigInt(serviceBalance.raw) < need) {
      warn = `На сервисном кошельке ${serviceBalance.human} ${drop.rewardToken} — нужно ещё ${remaining}${
        drop.rewardKindIsRange ? " (макс)" : ""
      }`;
    }
  } else if (remaining == null && drop.totalNfts > 0 && serviceBalance) {
    // Без лимитов — берём worstcase = totalNfts * rewardMax - paidOut
    const worst = Math.max(
      0,
      drop.totalNfts * drop.rewardMax - drop.totalPaidOut
    );
    if (worst > 0) {
      const need = BigInt(worst) * 10n ** BigInt(serviceBalance.decimals);
      if (BigInt(serviceBalance.raw) < need) {
        warn = `Без лимитов: в худшем случае нужно ${worst}${
          drop.rewardKindIsRange ? " (макс)" : ""
        } ${drop.rewardToken}, есть ${serviceBalance.human}`;
      }
    }
  }

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-sm transition",
        warn
          ? "border-destructive/40"
          : "border-border/50 hover:border-border/80"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {/* Title — кликается чтобы развернуть, иначе truncate. */}
          <button
            type="button"
            onClick={() => setTitleExpanded((v) => !v)}
            title={drop.title}
            className={cn(
              "block w-full min-w-0 text-left font-medium",
              titleExpanded ? "break-words" : "truncate"
            )}
          >
            {drop.title}
          </button>

          {drop.mode !== "combo" && (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {drop.totalNfts} NFT в коллекции · {drop.contractId}
            </div>
          )}

          {/* Чипсы требований combo */}
          {drop.mode === "combo" && drop.requirements && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {drop.requirements.map((r, i) => (
                <span
                  key={`${r.title}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/30 px-1.5 py-0.5 text-[11px]"
                >
                  <span className="text-foreground">{r.title}</span>
                  <span className="text-muted-foreground">×{r.count}</span>
                </span>
              ))}
            </div>
          )}

          {/* Reward / stats / badges */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {drop.mode === "combo" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-[10px] font-medium text-neon">
                <Layers className="h-3 w-3" />
                combo
              </span>
            )}
            <RewardBadge drop={drop} />
            {drop.mode === "combo" && (
              <span className="text-[10px] text-muted-foreground">/комбо</span>
            )}
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
              <Users className="h-3 w-3" />
              {drop.uniqueClaimers} клеймеров
              {drop.maxUsers ? ` / ${drop.maxUsers}` : ""}
            </span>
            {drop.maxTotalPool ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                <Coins className="h-3 w-3" />
                Фонд: {drop.totalPaidOut} / {drop.maxTotalPool}{" "}
                {drop.rewardToken}
              </span>
            ) : null}
            {drop.freeClaim ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success">
                <Gift className="h-3 w-3" />
                free claim
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-gold">
                <Ticket className="h-3 w-3" />
                {drop.ticketCost ?? 1} {drop.mode === "combo" ? "за комбо" : "за клейм"}
              </span>
            )}
          </div>
        </div>
        {!editing && (
          <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
            <button
              onClick={onCopy}
              title="Копировать — заполнить форму копией этого дропа"
              aria-label="Копировать дроп"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-gold/5 text-gold transition hover:bg-gold/10"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              onClick={onEdit}
              title="Редактировать дроп"
              aria-label="Редактировать дроп"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={onTogglePause}
              disabled={togglingPause || drop.status === "ended"}
              title={
                drop.status === "paused"
                  ? "Возобновить — снова виден юзерам"
                  : "На паузу — спрятать от юзеров"
              }
              aria-label={
                drop.status === "paused" ? "Возобновить дроп" : "Поставить на паузу"
              }
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition disabled:opacity-50",
                drop.status === "paused"
                  ? "border-success/40 bg-success/5 text-success hover:bg-success/10"
                  : "border-amber-500/40 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10"
              )}
            >
              {drop.status === "paused" ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={onToggleRecurring}
              disabled={togglingRecurring || drop.status === "ended"}
              title={
                drop.recurring
                  ? "Авто-перезапуск ВКЛ: каждые 30 дней дроп пересоздаётся, юзеры клеймят награду по своим NFT заново. Нажми, чтобы выключить."
                  : "Авто-перезапуск ВЫКЛ. Включить — чтобы дроп пересоздавался сам каждые 30 дней (клейм по NFT раз в 30 дней), а не завершался."
              }
              aria-label="Авто-перезапуск дропа (каждые 30 дней)"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition disabled:opacity-50",
                drop.recurring
                  ? "border-neon/50 bg-neon/10 text-neon shadow-[0_0_12px_-3px] shadow-neon"
                  : "border-border/50 bg-secondary/40 text-muted-foreground hover:text-foreground"
              )}
            >
              <Repeat className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              title="Удалить дроп"
              aria-label="Удалить дроп"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {warn && !editing && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{warn}</span>
        </div>
      )}
      {editing && (
        <DropEditForm drop={drop} tokens={tokens} onClose={onCancelEdit} />
      )}

      {/* Развернуть список клеймеров */}
      {!editing && drop.uniqueClaimers > 0 && (
        <div className="mt-3 border-t border-border/50 pt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-[11px] text-muted-foreground transition hover:bg-secondary/30 hover:text-foreground"
          >
            <Users className="h-3.5 w-3.5" />
            <span>
              Клеймеры · {drop.uniqueClaimers}
              {(() => {
                // Для NFT-tier и pack-tier «всего выплачено» бессмысленно
                // (amount=0). Показываем только для FT-tier дропов.
                const tiers = drop.rewardTiers ?? [];
                const allNonFt =
                  tiers.length > 0 &&
                  tiers.every(
                    (t) =>
                      (t as { kind?: string }).kind === "nft" ||
                      (t as { kind?: string }).kind === "pack"
                  );
                if (allNonFt) return null;
                const byTok = drop.payoutByToken ?? [];
                return (
                  <>
                    {" · всего выплачено "}
                    <span className="text-foreground">
                      {byTok.length > 0
                        ? byTok
                            .map((t) => `${t.amount} ${t.token}`)
                            .join(" · ")
                        : `${drop.totalPaidOut} ${drop.rewardToken}`}
                    </span>
                  </>
                );
              })()}
            </span>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 transition",
                expanded && "rotate-180 text-gold"
              )}
            />
          </button>
          {expanded && (
            <div className="mt-2">
              {claimers.isLoading ? (
                <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Загружаю…
                </div>
              ) : (claimers.data ?? []).length === 0 ? (
                <div className="px-2 py-2 text-[11px] text-muted-foreground">
                  Пока никто не клеймил.
                </div>
              ) : (() => {
                const tiers = drop.rewardTiers ?? [];
                const allNonFt =
                  tiers.length > 0 &&
                  tiers.every(
                    (t) =>
                      (t as { kind?: string }).kind === "nft" ||
                      (t as { kind?: string }).kind === "pack"
                  );
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="text-muted-foreground">
                        <tr className="border-b border-border/40 text-left">
                          <th className="py-1.5 pr-2 font-normal">Кошелёк</th>
                          <th className="py-1.5 px-2 text-right font-normal">
                            Клеймов
                          </th>
                          {!allNonFt && (
                            <th className="py-1.5 pl-2 text-right font-normal">
                              Сумма
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {(claimers.data ?? []).map((c) => (
                          <tr
                            key={c.wallet}
                            className="border-b border-border/30 last:border-b-0"
                          >
                            <td className="py-1.5 pr-2 font-mono text-foreground">
                              {c.wallet}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono">
                              ×{c.claimsCount}
                            </td>
                            {!allNonFt && (
                              <td className="py-1.5 pl-2 text-right font-mono text-gold">
                                {(c.byToken ?? []).length > 0
                                  ? (c.byToken ?? [])
                                      .map((t) => `${t.amount} ${t.token}`)
                                      .join(" · ")
                                  : `${c.totalAmount} ${drop.rewardToken}`}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
