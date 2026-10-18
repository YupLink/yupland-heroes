import {
  ChevronRight,
  Loader2,
  Swords,
  Package,
  Pickaxe,
  Skull,
  Gem,
  HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";

// Кнопок направлений больше нет: героем управляют тапом по самой карте
// (BetaRaidCanvas → onCellClick). Здесь остался только разбор объекта рядом.

const KIND_ICON = { boss: Skull, chest: Package, mine: Pickaxe, artifact: Gem } as const;
const KIND_TINT = {
  boss: "text-destructive bg-destructive/12",
  chest: "text-gold bg-gold/12",
  mine: "text-neon bg-neon/12",
  artifact: "text-neon bg-neon/12",
} as const;

/** Карточка «рядом объект» — вход в энкаунтер. Одна на босса, сундук и шахту. */
export function BetaAdjacentObject({
  name,
  imageUrl,
  kind,
  badgeLabel,
  actionLabel,
  busy,
  onOpen,
}: {
  name: string;
  imageUrl: string | null;
  kind: "boss" | "chest" | "mine" | "artifact";
  badgeLabel: string;
  /** «В бой» у босса, «Открыть»/«Забрать» у лута. */
  actionLabel: string;
  busy: boolean;
  onOpen: () => void;
}) {
  const Icon = KIND_ICON[kind] ?? Package;
  return (
    <button
      onClick={onOpen}
      disabled={busy}
      className="mx-2 flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-gold/40 active:scale-[0.99] disabled:opacity-50"
    >
      {imageUrl ? (
        <img
          src={thumb(imageUrl, 96)}
          alt=""
          className="h-12 w-12 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            KIND_TINT[kind],
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {badgeLabel}
        </div>
        <div className="truncate font-display font-bold">{name}</div>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-xl gradient-gold px-3 py-2 text-sm font-bold text-gold-foreground shadow-gold">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : kind === "boss" ? (
          <Swords className="h-4 w-4" />
        ) : (
          <HandCoins className="h-4 w-4" />
        )}
        {actionLabel}
        <ChevronRight className="h-4 w-4 opacity-70" />
      </span>
    </button>
  );
}
