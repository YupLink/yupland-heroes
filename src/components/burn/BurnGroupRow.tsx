// Строка сжигания: одно название NFT, сколько их есть и сколько сжечь.
import { memo } from "react";
import { Minus, Plus } from "lucide-react";
import { NftImage } from "@/components/NftImage";
import { cn } from "@/lib/utils";
import type { BurnGroup } from "@/server/api/nft-burn";

const stepBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/40 transition hover:bg-secondary disabled:opacity-30";

export const BurnGroupRow = memo(function BurnGroupRow({
  group,
  qty,
  canAdd,
  maxLabel,
  onChange,
}: {
  group: BurnGroup;
  qty: number;
  /** Есть ли куда добавлять: и копии остались, и общий лимит не выбран. */
  canAdd: boolean;
  maxLabel: string;
  onChange: (group: BurnGroup, want: number) => void;
}) {
  const owned = group.tokenIds.length;
  return (
    // content-visibility: у кошелька коллекции >1000 строк — вне экрана не раскладываем.
    <div
      className={cn(
        "flex gap-3 rounded-2xl border bg-card p-2.5 transition [contain-intrinsic-size:auto_96px] [content-visibility:auto]",
        qty > 0 ? "border-destructive/50" : "border-border/50",
      )}
    >
      <NftImage
        src={group.media}
        alt={group.title}
        width={128}
        className="h-16 w-16 shrink-0 rounded-xl bg-secondary object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-semibold leading-snug">{group.title}</div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="mr-auto font-display text-xs tabular-nums text-muted-foreground">
            × {owned}
          </span>
          <button
            type="button"
            aria-label="−1"
            className={stepBtn}
            disabled={qty === 0}
            onClick={() => onChange(group, qty - 1)}
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            inputMode="numeric"
            value={qty === 0 ? "" : String(qty)}
            placeholder="0"
            onChange={(e) => onChange(group, Number(e.target.value.replace(/\D/g, "")) || 0)}
            className={cn(
              "h-9 w-12 rounded-lg border border-border bg-secondary/40 text-center font-display text-sm font-bold tabular-nums outline-none focus:border-gold/50",
              qty > 0 && "text-destructive",
            )}
          />
          <button
            type="button"
            aria-label="+1"
            className={stepBtn}
            disabled={!canAdd}
            onClick={() => onChange(group, qty + 1)}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="h-9 rounded-lg px-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-30"
            disabled={!canAdd}
            onClick={() => onChange(group, owned)}
          >
            {maxLabel}
          </button>
        </div>
      </div>
    </div>
  );
});
